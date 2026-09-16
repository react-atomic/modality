// Fixture: a well-formed command that declares its own aliases.
const runAlpha = async (): Promise<unknown> => ({ success: true, ran: "alpha" });

export const alphaCommand = {
  name: "alpha",
  summary: "fixture alpha command",
  aliases: ["a", "al"],
  execute: runAlpha,
};
