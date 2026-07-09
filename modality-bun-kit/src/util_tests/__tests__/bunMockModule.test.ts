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

  // --- Graceful fallback tests (new behavior) ---
  // When the original module has deep transitive dependencies that can't be resolved
  // (e.g. vscode, modality-kit side-effect imports), bunMockModule should catch the
  // import failure and apply the mock without throwing.
  //
  // Each test uses a unique bare module specifier (no ./ prefix) to avoid Bun's
  // mock.module() write-once behavior — once a mock is set for a given specifier,
  // subsequent mock.module() calls for the same specifier are silently ignored.
  // Bare specifiers trigger Bun's module resolution which fails gracefully at
  // runtime (unlike relative paths which Bun validates at compile time).

  test("should not throw when original module cannot be imported (graceful fallback)", async () => {
    await expect(
      bunMockModule("__graceful_no_throw__", () => ({ value: 1 }), __dirname),
    ).resolves.toEqual(expect.any(Function));
  });

  test("should apply mock when original module cannot be imported", async () => {
    const path = "__graceful_mock_applied__";
    await bunMockModule(path, () => ({ value: 1 }), __dirname);
    const mod: any = await import(path);
    expect(mod.value).toBe(1);
  });
});
