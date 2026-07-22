import * as NodeAssert from "node:assert/strict";
import * as NodeOS from "node:os";
import { describe, it } from "@effect/vitest";

import {
  normalizeCopilotModel,
  normalizeCopilotConfigDirectory,
  normalizeCopilotRuntimePath,
  sanitizeCopilotEnvironment,
} from "./copilotEnvironment.ts";

describe("Copilot environment", () => {
  it("uses the SDK runtime for blank and legacy pathless overrides", () => {
    NodeAssert.equal(normalizeCopilotRuntimePath(""), undefined);
    NodeAssert.equal(normalizeCopilotRuntimePath(" copilot "), undefined);
    NodeAssert.equal(normalizeCopilotRuntimePath("/opt/copilot"), "/opt/copilot");
  });

  it("omits legacy auto model selections", () => {
    NodeAssert.equal(normalizeCopilotModel("auto"), undefined);
    NodeAssert.equal(normalizeCopilotModel(" AUTO "), undefined);
    NodeAssert.equal(normalizeCopilotModel("claude-sonnet-4.5"), "claude-sonnet-4.5");
  });

  it("expands custom Copilot homes before passing them to the SDK", () => {
    NodeAssert.equal(
      normalizeCopilotConfigDirectory(" ~/.copilot-work "),
      `${NodeOS.homedir()}/.copilot-work`,
    );
  });

  it("does not leak desktop host variables into the runtime", () => {
    NodeAssert.deepEqual(
      sanitizeCopilotEnvironment({
        PATH: "/bin",
        ELECTRON_RUN_AS_NODE: "1",
        ELECTRON_RENDERER_PORT: "1234",
        CLAUDECODE: "1",
      }),
      { PATH: "/bin" },
    );
  });
});
