import { describe, test, expect } from "bun:test";
import { bunMockModule } from "../bunMockModule.ts";

describe("bunMockModule", () => {
  test("should accept path string and mockFactory function", async () => {
    const reset = await bunMockModule("./fake.import", () => ({
      fakeImport: { foo: "bar1" },
    }), __dirname);
    const mod: any = await import("./fake.import");
    expect(mod.fakeImport.foo).toBe("bar1");
    reset();
    const mod1: any = await import("./fake.import");
    expect(mod1.fakeImport.foo).toBe("bar");
  });

  test("should throw on invalid path", async () => {
    try {
      await bunMockModule("", () => ({}));
      expect(true).toBe(false); // Should have thrown
    } catch (e) {
      expect((e as Error).message).toMatch(/Invalid module path/);
    }
  });

  test("should throw on invalid mockFactory", async () => {
    try {
      await bunMockModule("./modalityLogger.ts", {} as any);
      expect(true).toBe(false); // Should have thrown
    } catch (e) {
      expect((e as Error).message).toMatch(/Invalid mock factory/);
    }
  });
});
