/**
 * Pure configuration logic for the modality-mcp CLI — kept free of
 * side effects so it stays unit-testable without booting a server.
 */

import { resolve } from "node:path";
import type { FastHonoMcpConfig } from "../FastHonoMcp";

export interface McpCliConfig
  extends Partial<Pick<FastHonoMcpConfig, "helloWorld" | "mcpPath">> {
  methodsDir?: string;
  port?: number;
  host?: string;
}

export interface ProjectPackageJson {
  name?: string;
  version?: string;
  mcp?: McpCliConfig;
}

export const DEFAULT_METHODS_DIR = "methods";
export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = "0.0.0.0";

export interface ResolvedMethodsDir {
  dir: string;
  /** True when the folder was requested by the user (CLI arg or package.json) — a miss must fail loudly. */
  explicit: boolean;
}

export const resolveMethodsDir = (
  cwd: string,
  argDir?: string,
  configDir?: string,
): ResolvedMethodsDir => {
  const explicitDir = argDir ?? configDir;
  return {
    dir: resolve(cwd, explicitDir ?? DEFAULT_METHODS_DIR),
    explicit: explicitDir !== undefined,
  };
};

export const buildMcpConfig = (pkg: ProjectPackageJson): FastHonoMcpConfig => {
  const cliConfig = pkg.mcp ?? {};
  return {
    name: pkg.name ?? "modality-mcp",
    version: pkg.version ?? "0.0.0",
    ...(cliConfig.helloWorld ? { helloWorld: cliConfig.helloWorld } : {}),
    ...(cliConfig.mcpPath ? { mcpPath: cliConfig.mcpPath } : {}),
  };
};

export const resolvePort = (
  envPort: string | undefined,
  configPort: number | undefined,
): number => {
  const rawPort = parseInt(envPort || String(configPort ?? DEFAULT_PORT), 10);
  // 0 is valid: it asks the OS for an ephemeral port.
  const isValidPort =
    Number.isInteger(rawPort) && rawPort >= 0 && rawPort <= 65535;
  return isValidPort ? rawPort : DEFAULT_PORT;
};

export const resolveHostname = (
  envHost: string | undefined,
  configHost: string | undefined,
): string => envHost || configHost || DEFAULT_HOST;
