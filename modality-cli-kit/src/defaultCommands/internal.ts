/**
 * The raw-argv lock — kit-internal, deliberately unexported.
 *
 * One default command (`skill`) forwards arbitrary `--key value` pairs to
 * another tool, so the runner cannot validate its argv against a static
 * `inputSchema`: the valid flags depend on which Counter method was named, and
 * only that command can resolve them. It therefore receives the raw `string[]`
 * and validates internally against a schema built from the method's own
 * declared parameters.
 *
 * That is a genuine hole in the runner's validation, so it is not offered as a
 * capability. There is no `rawArgs` field on {@link CLICommand}, nothing on the
 * command object, and nothing in the published `.d.ts` — a consuming CLI has no
 * way to declare it, because {@link markRawArgv} is never re-exported from
 * `src/index.ts` and the WeakSet it writes to is module-private. Membership is
 * by object identity, which cannot be forged, copied, or serialized in.
 *
 * The rule this enforces: **a command may only skip runner validation if the
 * kit itself wrote it.** Widening that means adding a call here, in this file,
 * as a deliberate act — not setting a flag from the outside.
 */
import type { CLICommand } from "../help/types";

/**
 * Identity set, not a property — a command's mark cannot survive `{ ...cmd }`,
 * `structuredClone`, or a JSON round-trip. That is the point: there is nothing
 * on the object to copy or forge.
 *
 * The cost is that the kit copies commands on the way in, so the grant has to
 * be re-applied to whatever object ends up being dispatched. Both copy sites:
 *
 *  - `registry.ts` normalizes every command into `{ ...cmd, summary,
 *    description }` at registration — `createCliRunner` re-marks the registered
 *    object right after building the registry.
 *  - `createCliRunner` builds `{ ...cmd, aliases }` copies for help generation.
 *    Those are deliberately left unmarked; they never reach dispatch.
 */
const rawArgvCommands = new WeakSet<CLICommand>();

/** Grant a kit-authored command the raw-argv path. Returns it for chaining. */
export function markRawArgv<T extends CLICommand>(command: T): T {
  rawArgvCommands.add(command);
  return command;
}

/** Does the runner hand this exact command object its argv unvalidated? */
export function takesRawArgv(command: CLICommand): boolean {
  return rawArgvCommands.has(command);
}
