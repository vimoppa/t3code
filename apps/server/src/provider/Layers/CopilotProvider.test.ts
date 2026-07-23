import type { CopilotClientOptions, ModelInfo } from "@github/copilot-sdk";
import { assert, it } from "@effect/vitest";
import type { CopilotSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { checkCopilotProviderStatus } from "./CopilotProvider.ts";

const settings: CopilotSettings = {
  enabled: true,
  binaryPath: "",
  configDir: "",
  customModels: ["auto"],
};

const model = {
  id: "claude-sonnet-4.5",
  name: "Claude Sonnet 4.5",
  capabilities: {
    supports: { vision: true, reasoningEffort: true },
    limits: { max_context_window_tokens: 128_000 },
  },
  supportedReasoningEfforts: ["low", "high"],
  defaultReasoningEffort: "high",
} satisfies ModelInfo;

it.effect("discovers Copilot models, agents, and AI skills with the bundled runtime", () =>
  Effect.gen(function* () {
    let clientOptions: CopilotClientOptions | undefined;
    const client = {
      start: async () => undefined,
      stop: async () => [],
      getStatus: async () => ({ version: "1.0.73" }),
      getAuthStatus: async () => ({ isAuthenticated: true, login: "vimoppa" }),
      listModels: async () => [model],
      rpc: {
        agents: {
          discover: async () => ({
            agents: [
              {
                name: "reviewer",
                id: "reviewer",
                displayName: "Reviewer",
                description: "Reviews changes",
                userInvocable: true,
              },
            ],
          }),
        },
        skills: {
          discover: async () => ({
            skills: [
              {
                name: "agentic-engineering",
                description: "Engineering workflow",
                source: "custom",
                userInvocable: true,
                enabled: true,
                path: "/Users/test/.agents/skills/agentic-engineering/SKILL.md",
              },
            ],
          }),
        },
      },
    };

    const snapshot = yield* checkCopilotProviderStatus(
      settings,
      "/repo",
      { PATH: "/bin", ELECTRON_RUN_AS_NODE: "1" },
      ((options: CopilotClientOptions) => {
        clientOptions = options;
        return client;
      }) as never,
    );

    assert.isUndefined(clientOptions?.connection);
    assert.isUndefined(clientOptions?.env?.ELECTRON_RUN_AS_NODE);
    assert.strictEqual(snapshot.status, "ready");
    assert.deepStrictEqual(snapshot.auth, {
      status: "authenticated",
      type: "github",
      label: "vimoppa",
    });
    assert.deepStrictEqual(
      snapshot.models.map((entry) => entry.slug),
      ["claude-sonnet-4.5"],
    );
    assert.isTrue(
      snapshot.models[0]?.capabilities?.optionDescriptors?.some(
        (descriptor) => descriptor.id === "reasoningEffort" && descriptor.currentValue === "high",
      ),
    );
    assert.isTrue(
      snapshot.models[0]?.capabilities?.optionDescriptors?.some(
        (descriptor) => descriptor.id === "agent",
      ),
    );
    assert.strictEqual(snapshot.skills[0]?.name, "agentic-engineering");
    assert.isTrue(snapshot.skills[0]?.enabled);
  }),
);
