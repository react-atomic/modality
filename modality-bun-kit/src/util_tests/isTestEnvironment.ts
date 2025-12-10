export const isTestEnvironment =
  process.env.NODE_ENV === "test" ||
  process.env.BUN_ENV === "test" ||
  globalThis.Bun?.main?.includes?.("test");
