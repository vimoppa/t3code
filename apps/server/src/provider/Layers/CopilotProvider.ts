// @effect-diagnostics globalDate:off globalDateInEffect:off - Provider snapshot DTOs use ISO timestamps.
import type {
  CopilotClient as CopilotClientType,
  CopilotClientOptions,
  ModelInfo,
} from "@github/copilot-sdk";
import {
  type CopilotSettings,
  type ModelCapabilities,
  type ServerProviderModel,
  type ServerProviderSkill,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import {
  buildServerProvider,
  providerModelsFromSettings,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  copilotSkillDirectories,
  normalizeCopilotConfigDirectory,
  normalizeCopilotModel,
  normalizeCopilotRuntimePath,
  sanitizeCopilotEnvironment,
} from "./copilotEnvironment.ts";

const COPILOT_PRESENTATION = {
  displayName: "GitHub Copilot",
  showInteractionModeToggle: true,
} as const;

const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({ optionDescriptors: [] });

export type CopilotClientFactory = (options: CopilotClientOptions) => CopilotClientHandle;

interface CopilotClientHandle {
  start(): Promise<void>;
  stop(): Promise<unknown>;
  getStatus(): Promise<{ version: string }>;
  getAuthStatus(): Promise<{
    isAuthenticated: boolean;
    authType?: string;
    login?: string;
    statusMessage?: string;
  }>;
  listModels(): Promise<ReadonlyArray<ModelInfo>>;
  readonly rpc: CopilotClientType["rpc"];
}

interface CopilotAgentInfo {
  readonly name: string;
  readonly displayName: string;
  readonly userInvocable?: boolean;
}

interface CopilotSkillInfo {
  readonly name: string;
  readonly description: string;
  readonly source: unknown;
  readonly enabled: boolean;
  readonly path?: string;
}

class CopilotProbeError extends Data.TaggedError("CopilotProbeError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

function filteredCustomModels(settings: CopilotSettings): ReadonlyArray<string> {
  return settings.customModels.flatMap((model) => {
    const normalized = normalizeCopilotModel(model);
    return normalized ? [normalized] : [];
  });
}

function capabilitiesForModel(
  model: ModelInfo,
  agents: ReadonlyArray<CopilotAgentInfo>,
): ModelCapabilities {
  const reasoningOptions = (model.supportedReasoningEfforts ?? []).map((effort) => ({
    id: effort,
    label: effort === "xhigh" ? "Extra High" : `${effort[0]?.toUpperCase()}${effort.slice(1)}`,
    ...(model.defaultReasoningEffort === effort ? { isDefault: true as const } : {}),
  }));
  const agentOptions = agents
    .filter((agent) => agent.userInvocable !== false)
    .map((agent) => ({ id: agent.name, label: agent.displayName || agent.name }));

  return createModelCapabilities({
    optionDescriptors: [
      ...(reasoningOptions.length > 0
        ? [
            {
              id: "reasoningEffort",
              label: "Reasoning",
              type: "select" as const,
              options: reasoningOptions,
              ...(model.defaultReasoningEffort
                ? { currentValue: model.defaultReasoningEffort }
                : {}),
            },
          ]
        : []),
      ...(agentOptions.length > 0
        ? [
            {
              id: "agent",
              label: "Agent",
              type: "select" as const,
              options: agentOptions,
            },
          ]
        : []),
    ],
  });
}

function mapModels(
  models: ReadonlyArray<ModelInfo>,
  agents: ReadonlyArray<CopilotAgentInfo>,
): ReadonlyArray<ServerProviderModel> {
  return models.flatMap((model) => {
    const slug = normalizeCopilotModel(model.id);
    if (!slug || model.policy?.state === "disabled") return [];
    return [
      {
        slug,
        name: model.name || slug,
        isCustom: false,
        capabilities: capabilitiesForModel(model, agents),
      },
    ];
  });
}

function mapSkills(skills: ReadonlyArray<CopilotSkillInfo>): ReadonlyArray<ServerProviderSkill> {
  return skills.flatMap((skill) => {
    if (!skill.path) return [];
    return [
      {
        name: skill.name,
        ...(skill.description ? { description: skill.description } : {}),
        path: skill.path,
        scope: typeof skill.source === "string" ? skill.source : "copilot",
        enabled: skill.enabled,
      },
    ];
  });
}

async function defaultClientFactory(options: CopilotClientOptions): Promise<CopilotClientHandle> {
  const { CopilotClient } = await import("@github/copilot-sdk");
  return new CopilotClient(options);
}

async function clientOptions(
  settings: CopilotSettings,
  workingDirectory: string | undefined,
  environment: NodeJS.ProcessEnv,
): Promise<CopilotClientOptions> {
  const runtimePath = normalizeCopilotRuntimePath(settings.binaryPath);
  const configDirectory = normalizeCopilotConfigDirectory(settings.configDir);
  const connection = runtimePath
    ? (await import("@github/copilot-sdk")).RuntimeConnection.forStdio({ path: runtimePath })
    : undefined;
  return {
    ...(connection ? { connection } : {}),
    ...(workingDirectory ? { workingDirectory } : {}),
    ...(configDirectory ? { baseDirectory: configDirectory } : {}),
    env: sanitizeCopilotEnvironment(environment),
    logLevel: "error",
  };
}

export const makePendingCopilotProvider = (settings: CopilotSettings): ServerProviderDraft => {
  const checkedAt = new Date().toISOString();
  const models = providerModelsFromSettings([], filteredCustomModels(settings), EMPTY_CAPABILITIES);
  return buildServerProvider({
    presentation: COPILOT_PRESENTATION,
    enabled: settings.enabled,
    checkedAt,
    models,
    probe: {
      installed: false,
      version: null,
      status: "warning",
      auth: { status: "unknown" },
      message: settings.enabled
        ? "GitHub Copilot status has not been checked in this session yet."
        : "GitHub Copilot is disabled in T3 Code settings.",
    },
  });
};

export const checkCopilotProviderStatus = Effect.fn("checkCopilotProviderStatus")(function* (
  settings: CopilotSettings,
  workingDirectory?: string,
  environment: NodeJS.ProcessEnv = process.env,
  factory?: CopilotClientFactory,
) {
  if (!settings.enabled) return makePendingCopilotProvider(settings);

  const checkedAt = new Date().toISOString();
  const result = yield* Effect.tryPromise({
    try: async () => {
      const options = await clientOptions(settings, workingDirectory, environment);
      const client = factory ? factory(options) : await defaultClientFactory(options);
      try {
        await client.start();
        const [status, auth, models, agentsResult, skillsResult] = await Promise.all([
          client.getStatus(),
          client.getAuthStatus(),
          client.listModels(),
          client.rpc.agents.discover({ projectPaths: workingDirectory ? [workingDirectory] : [] }),
          client.rpc.skills.discover({
            projectPaths: workingDirectory ? [workingDirectory] : [],
            skillDirectories: [...copilotSkillDirectories()],
          }),
        ]);
        const builtInModels = mapModels(models, agentsResult.agents);
        return {
          status,
          auth,
          models: providerModelsFromSettings(
            builtInModels,
            filteredCustomModels(settings),
            EMPTY_CAPABILITIES,
          ),
          skills: mapSkills(skillsResult.skills),
        };
      } finally {
        await client.stop().catch(() => undefined);
      }
    },
    catch: (cause) =>
      new CopilotProbeError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  }).pipe(Effect.timeoutOption("10 seconds"), Effect.result);

  if (Result.isFailure(result) || Option.isNone(result.success)) {
    const message = Result.isFailure(result)
      ? result.failure.message
      : "GitHub Copilot runtime check timed out.";
    return buildServerProvider({
      presentation: COPILOT_PRESENTATION,
      enabled: true,
      checkedAt,
      models: providerModelsFromSettings([], filteredCustomModels(settings), EMPTY_CAPABILITIES),
      probe: {
        installed: false,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: `GitHub Copilot runtime check failed: ${message}`,
      },
    });
  }

  const probe = result.success.value;
  return buildServerProvider({
    presentation: COPILOT_PRESENTATION,
    enabled: true,
    checkedAt,
    models: probe.models,
    skills: probe.skills,
    probe: {
      installed: true,
      version: probe.status.version,
      status: probe.auth.isAuthenticated ? "ready" : "warning",
      auth: probe.auth.isAuthenticated
        ? {
            status: "authenticated",
            type: "github",
            ...(probe.auth.login ? { label: probe.auth.login } : {}),
          }
        : { status: "unauthenticated" },
      ...(!probe.auth.isAuthenticated
        ? { message: probe.auth.statusMessage ?? "Sign in with GitHub Copilot to start a session." }
        : {}),
    },
  });
});

export type { ServerProviderModel };
