#!/usr/bin/env bun
/**
 * modality-mcp CLI
 *
 * Boots an MCP server from the current working directory without a per-project
 * server entry file.
 *
 * Usage:
 *   modality-mcp              → load methods from ./methods
 *   modality-mcp <dir>        → load methods from a custom folder
 *
 * Configuration is read from the project's package.json:
 *   - name / version: server identity
 *   - "mcp" block (all optional): { helloWorld, methodsDir, mcpPath, port, host }
 *
 * Env overrides: PORT, HOST.
 *
 * `@modality-counter/core` is resolved from the consuming project at runtime
 * (it peer-depends on this kit, so it cannot be a direct dependency here).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { Hono } from "hono";
import { FastHonoMcp } from "./FastHonoMcp";
import {
  buildMcpConfig,
  resolveHostname,
  resolveMethodsDir,
  resolvePort,
  type McpCliConfig,
  type ProjectPackageJson,
} from "./utils/cli-config";

type SetupMcpCounter = (
  baseDir: string,
  mcpServer?: unknown,
) => Promise<unknown>;

const cwd = process.cwd();

const readProjectPackageJson = (): ProjectPackageJson => {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")) as ProjectPackageJson;
  } catch {
    console.warn(`[modality-mcp] Failed to parse ${pkgPath}, using defaults.`);
    return {};
  }
};

/**
 * Resolve a module from the consuming project first (covers global/bunx
 * installs where this package's own tree lacks the dependency), falling back
 * to normal resolution from this file.
 */
const importFromProject = async (specifier: string): Promise<unknown> => {
  try {
    const projectRequire = createRequire(join(cwd, "package.json"));
    return await import(projectRequire.resolve(specifier));
  } catch {
    return await import(specifier);
  }
};

const USAGE = `Usage: modality-mcp [methodsDir]

  methodsDir  Folder of MCP methods to load (default: ./methods,
              or "mcp.methodsDir" in package.json)

Environment: PORT, HOST`;

const methodsDirArg = process.argv[2];
if (methodsDirArg?.startsWith("-")) {
  if (methodsDirArg === "-h" || methodsDirArg === "--help") {
    console.log(USAGE);
    process.exit(0);
  }
  console.error(`[modality-mcp] Unknown option: ${methodsDirArg}\n${USAGE}`);
  process.exit(1);
}

const pkg = readProjectPackageJson();
const cliConfig: McpCliConfig = pkg.mcp ?? {};

const mcpConfig = buildMcpConfig(pkg);

const app = new Hono();
const mcp = new FastHonoMcp(mcpConfig);
mcp.initHono(app);

const { dir: methodsDir, explicit: isExplicitMethodsDir } = resolveMethodsDir(
  cwd,
  methodsDirArg,
  cliConfig.methodsDir,
);
const isDirectory = (path: string): boolean =>
  existsSync(path) && statSync(path).isDirectory();
if (isDirectory(methodsDir)) {
  const core = (await importFromProject("@modality-counter/core").catch(() => {
    console.warn(
      "[modality-mcp] @modality-counter/core not found in this project; " +
        `methods in ${methodsDir} will not be loaded.`,
    );
    return null;
  })) as { setupMcpCounter?: SetupMcpCounter } | null;
  if (core && typeof core.setupMcpCounter !== "function") {
    console.warn(
      "[modality-mcp] @modality-counter/core does not export setupMcpCounter; " +
        `methods in ${methodsDir} will not be loaded.`,
    );
  } else if (core?.setupMcpCounter) {
    await core.setupMcpCounter(methodsDir, mcp).catch((err: unknown) => {
      console.error(
        `[modality-mcp] Failed to load methods from ${methodsDir}:`,
        err,
      );
      process.exit(1);
    });
  }
} else if (isExplicitMethodsDir) {
  console.error(`[modality-mcp] Methods directory not found: ${methodsDir}`);
  process.exit(1);
} else {
  console.warn(
    `[modality-mcp] No methods directory at ${methodsDir}; starting without methods.`,
  );
}

const port = resolvePort(process.env.PORT, cliConfig.port);
const hostname = resolveHostname(process.env.HOST, cliConfig.host);

console.log(
  `[modality-mcp] ${mcpConfig.name}@${mcpConfig.version} starting on ${hostname}:${port}`,
);

export default {
  idleTimeout: 30,
  fetch: app.fetch,
  port,
  hostname,
};
