import * as NodeAssert from "node:assert/strict";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, vi } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { CopilotAdapter } from "../Services/CopilotAdapter.ts";
import {
  approvalDecisionToPermissionResult,
  isSubagentAssistantEvent,
  makeCopilotAdapterLive,
} from "./CopilotAdapter.ts";

it("preserves session-wide approvals", () => {
  NodeAssert.deepEqual(approvalDecisionToPermissionResult("acceptForSession"), {
    kind: "approve-for-session",
  });
});

it("identifies assistant events emitted by subagents", () => {
  NodeAssert.equal(
    isSubagentAssistantEvent({ type: "assistant.message", agentId: "agent-1" } as never),
    true,
  );
  NodeAssert.equal(isSubagentAssistantEvent({ type: "assistant.message" } as never), false);
  NodeAssert.equal(
    isSubagentAssistantEvent({ type: "assistant.usage", agentId: "agent-1" } as never),
    false,
  );
});

const session = {
  sessionId: "copilot-session-test",
  rpc: {
    mode: { set: vi.fn(async () => undefined) },
    plan: { read: vi.fn(async () => ({ exists: false, content: null, path: null })) },
    agent: {
      select: vi.fn(async () => undefined),
      deselect: vi.fn(async () => undefined),
    },
  },
  disconnect: vi.fn(async () => undefined),
  on: vi.fn(() => () => undefined),
  send: vi.fn(async () => "message-1"),
  abort: vi.fn(async () => undefined),
  getEvents: vi.fn(async () => []),
};

const createSession = vi.fn(async (_config: unknown) => session);
const stop = vi.fn(async () => []);
const client = {
  start: vi.fn(async () => undefined),
  listModels: vi.fn(async () => []),
  createSession,
  resumeSession: vi.fn(async () => session),
  stop,
};

const layer = it.layer(
  makeCopilotAdapterLive({ clientFactory: () => client as never }).pipe(
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), process.cwd())),
    Layer.provideMerge(ServerSettingsService.layerTest()),
    Layer.provideMerge(NodeServices.layer),
  ),
);

layer("Copilot adapter session configuration", (it) => {
  it.effect("omits legacy auto and enables native agent and skill discovery", () =>
    Effect.gen(function* () {
      createSession.mockClear();
      stop.mockClear();

      const adapter = yield* CopilotAdapter;
      const started = yield* adapter.startSession({
        provider: ProviderDriverKind.make("copilot"),
        threadId: ThreadId.make("copilot-auto-test"),
        runtimeMode: "full-access",
        modelSelection: {
          instanceId: ProviderInstanceId.make("copilot"),
          model: "auto",
          options: [],
        },
      });

      const config = createSession.mock.calls[0]?.[0] as Record<string, unknown>;
      NodeAssert.equal(config.model, undefined);
      NodeAssert.equal(config.enableConfigDiscovery, true);
      NodeAssert.equal(config.includeSubAgentStreamingEvents, false);
      NodeAssert.ok(
        (config.skillDirectories as string[]).some((directory) =>
          directory.endsWith("/.agents/skills"),
        ),
      );

      yield* adapter.stopSession(started.threadId);
      NodeAssert.equal(stop.mock.calls.length, 1);
    }),
  );
});
