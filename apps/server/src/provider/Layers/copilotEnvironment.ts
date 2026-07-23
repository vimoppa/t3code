import * as NodeOS from "node:os";

import { expandHomePath } from "../../pathExpansion.ts";

const DESKTOP_ONLY_ENV_KEYS = ["ELECTRON_RUN_AS_NODE", "ELECTRON_RENDERER_PORT", "CLAUDECODE"];

export function normalizeCopilotRuntimePath(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized === "copilot") return undefined;
  return normalized;
}

export function normalizeCopilotModel(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized.toLowerCase() === "auto") return undefined;
  return normalized;
}

export function normalizeCopilotConfigDirectory(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? expandHomePath(normalized) : undefined;
}

export function sanitizeCopilotEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
  const sanitized = { ...environment };
  for (const key of DESKTOP_ONLY_ENV_KEYS) delete sanitized[key];
  return sanitized;
}

export function copilotSkillDirectories(): ReadonlyArray<string> {
  return [`${NodeOS.homedir()}/.agents/skills`];
}

export function withSanitizedCopilotDesktopEnv<T>(operation: () => Promise<T>): Promise<T> {
  return operation();
}
