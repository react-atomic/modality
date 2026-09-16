// Fixture: a well-formed command with no aliases of its own.
const runBeta = async (): Promise<unknown> => ({ success: true, ran: "beta" });

export const betaCommand = {
  name: "beta",
  summary: "fixture beta command",
  execute: runBeta,
};
