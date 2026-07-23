/**
 * CLI runner — the argv → resolve → validate → dispatch loop.
 *
 * `buildCliFromTools` supplies help, alias-aware `getHelp`, and flag rejection
 * but stubs `execute`; `validateCLICommandArgs` turns argv into schema-checked
 * data without ever throwing. This runner stitches them to a
 * {@link CommandRegistry} so a consuming package only supplies its commands
 * plus a little config.
 *
 * ## Quick start
 *
 * ```ts
 * import { z } from "zod";
 * import { createCliRunner } from "modality-cli-kit";
 * import { registry } from "./scripts/commands-index";
 *
 * export const cli = createCliRunner({
 *   cliName: "my-cli",
 *   tagline: "My toolkit",
 *   registry,
 *   skipFields: ["json"],
 *   onEmpty: () => { console.log("no command given"); return 0; },
 * });
 *
 * process.exit(await cli.run());
 * ```
 */
import type { z } from "zod";
import { buildCliFromTools } from "./help/cli-builder";
import { validateCLICommandArgs } from "./help/zod-cli";
import type { CommandRegistry } from "./registry";

/** Options for {@link createCliRunner}. */
export interface CliRunnerOptions {
  /** Binary name shown in help and usage lines. */
  cliName: string;
  /** One-line tagline shown at the top of global help. */
  tagline: string;
  /** The command registry to dispatch into. */
  registry: CommandRegistry;
  /** Global flags (e.g. `--help`, `--json`) rendered in the help footer. */
  globalOptionsSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
  /** Schema keys shared by all commands to keep out of per-command options. */
  skipFields?: string[];
  /**
   * Invoked when argv is empty. Return a process exit code. When omitted, the
   * runner prints global help and returns 1.
   */
  onEmpty?: () => number | Promise<number>;
  /** Render a command result to stdout. Default: pretty-printed JSON. */
  render?: (result: unknown) => void;
}

/** A runner returned by {@link createCliRunner}. */
export interface CliRunner {
  /** Parse argv, dispatch, and resolve to a process exit code. */
  run(argv?: string[]): Promise<number>;
  /** Render help for one command (by name/alias) or global help if omitted. */
  getHelp(command?: string): string;
}

/**
 * Create a {@link CliRunner} bound to a registry and help config.
 */
export function createCliRunner(options: CliRunnerOptions): CliRunner {
  const {
    cliName,
    tagline,
    registry,
    globalOptionsSchema,
    skipFields,
    onEmpty,
    render,
  } = options;

  // `buildCliFromTools` reads aliases off each command object, so project them
  // from the registry's alias map — keeping the registry the one source.
  const cli = buildCliFromTools(
    registry.all.map((cmd) => ({
      ...cmd,
      aliases: registry.aliases[cmd.name ?? ""] ?? [],
    })),
    { cliName, tagline, skipFields, globalOptionsSchema },
  );

  const renderResult =
    render ?? ((result: unknown) => console.log(JSON.stringify(result, null, 2)));

  async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
    const [name, ...rest] = argv;

    if (!name) {
      if (onEmpty) return onEmpty();
      console.log(cli.getHelp());
      return 1;
    }
    if (name === "--help" || name === "-h") {
      console.log(cli.getHelp());
      return 0;
    }
    if (name === "--version" || name === "-v") {
      // Version is typically set by the consuming package; fall through to help if not configured.
      console.log(`${cliName} (version not configured)`);
      return 0;
    }

    const command = registry.get(name);
    if (!command) {
      console.error(`Unknown command: ${name}\n`);
      console.log(cli.getHelp());
      return 1;
    }
    if (rest.includes("--help") || rest.includes("-h")) {
      console.log(cli.getHelp(name));
      return 0;
    }

    // Unknown flags, missing required args, and coercion failures all come back
    // as warnings — never throws — so a non-empty list means rejection.
    const { data, warnings } = validateCLICommandArgs(command, rest);
    if (warnings.length > 0) {
      for (const warning of warnings) console.error(warning);
      console.log(`\n${cli.getHelp(name)}`);
      return 1;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validateCLICommandArgs returns unknown; execute accepts the command's schema type which we cannot know statically
    const result = await command.execute(data as any);
    renderResult(result);
    const succeeded = result && typeof result === "object" && "success" in result
      ? (result as { success: boolean }).success !== false
      : true;
    return succeeded ? 0 : 1;
  }

  return { run, getHelp: cli.getHelp };
}
