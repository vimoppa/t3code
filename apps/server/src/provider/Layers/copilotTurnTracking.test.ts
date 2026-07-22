import { assert, it } from "@effect/vitest";

import { makeCopilotTurnTrackingState, recordTurnUsage } from "./copilotTurnTracking.ts";

it("accumulates usage across all model calls in one turn", () => {
  const state = makeCopilotTurnTrackingState();

  recordTurnUsage(state, {
    model: "claude-sonnet-4.5",
    inputTokens: 10,
    outputTokens: 4,
    cost: 0.25,
  });
  recordTurnUsage(state, {
    model: "claude-sonnet-4.5",
    inputTokens: 8,
    outputTokens: 3,
    cost: 0.5,
  });

  assert.strictEqual(state.pendingTurnUsage?.inputTokens, 18);
  assert.strictEqual(state.pendingTurnUsage?.outputTokens, 7);
  assert.strictEqual(state.pendingTurnUsage?.cost, 0.75);
});
