import { describe, expect, it } from "bun:test";
import { BaseLogger, type LoggerOptions, type LogLevel } from "../BaseLogger";

interface CapturedEntry {
  level: string;
  payload: any;
  category?: string;
}

class CaptureLogger extends BaseLogger {
  public entries: CapturedEntry[] = [];

  public static create(
    logOption: string | LoggerOptions,
    logLevel?: LogLevel
  ): CaptureLogger {
    return new CaptureLogger(logOption, logLevel);
  }

  protected output(level: string, payload: any, category?: string, _originalLevel?: LogLevel): void {
    this.entries.push({ level, payload, category });
  }

  public prefix(level: LogLevel, category?: string): string {
    return this.format(level, category);
  }
}

describe("BaseLogger", () => {
  it("routes helper methods to output with cooked payload", () => {
    const logger = CaptureLogger.create("test", "debug");
    logger.info("hello", { a: 1 });
    expect(logger.entries).toEqual([
      { level: "info", payload: { message: "hello", data: { a: 1 } }, category: undefined },
    ]);
  });

  it("filters entries below the log level", () => {
    const logger = CaptureLogger.create("test", "warn");
    logger.debug("skipped");
    logger.info("skipped");
    logger.warn("kept");
    logger.error("kept");
    logger.success("kept");
    expect(logger.entries.map((e) => e.level)).toEqual([
      "warn",
      "error",
      "success",
    ]);
  });

  it("updates filtering via setLogLevel", () => {
    const logger = CaptureLogger.create("test", "error");
    logger.info("skipped");
    logger.setLogLevel("debug");
    logger.debug("kept");
    expect(logger.entries.map((e) => e.level)).toEqual(["debug"]);
  });

  it("translates levels through levelMap before output", () => {
    const logger = CaptureLogger.create(
      {
        name: "test",
        levelMap: { info: "INFO", warn: "WARN", success: "INFO" },
      },
      "debug"
    );
    logger.info("a");
    logger.warn("b");
    logger.success("c");
    logger.debug("unmapped stays as-is");
    expect(logger.entries.map((e) => e.level)).toEqual([
      "INFO",
      "WARN",
      "INFO",
      "debug",
    ]);
  });

  it("passes the error() message as category", () => {
    const logger = CaptureLogger.create("test", "debug");
    const failure = new Error("boom");
    logger.error("Loading failed", failure, { file: "a.txt" });
    expect(logger.entries[0]?.category).toBe("Loading failed");
    expect(logger.entries[0]?.payload).toEqual({
      error: failure,
      data: { file: "a.txt" },
    });
  });

  it("formats prefix with name and category, without timestamp when disabled", () => {
    const logger = CaptureLogger.create(
      { name: "kit", timestampFormat: false },
      "debug"
    );
    expect(logger.prefix("info", "boot")).toBe("ℹ️ [kit] [boot]");
  });

  /* ---------- cook() ---------- */

  it("cook() wraps a string payload into a message object", () => {
    const logger = CaptureLogger.create("test", "debug");
    expect(logger.cook("hello")).toEqual({ message: "hello" });
  });

  it("cook() attaches data to a string payload", () => {
    const logger = CaptureLogger.create("test", "debug");
    expect(logger.cook("hello", { x: 1 })).toEqual({
      message: "hello",
      data: { x: 1 },
    });
  });

  it("cook() passes an object payload through when there is no data", () => {
    const logger = CaptureLogger.create("test", "debug");
    expect(logger.cook({ key: "val" })).toEqual({ key: "val" });
  });

  it("cook() adds data to an object payload", () => {
    const logger = CaptureLogger.create("test", "debug");
    expect(logger.cook({ key: "val" }, { x: 1 })).toEqual({
      key: "val",
      data: { x: 1 },
    });
  });

  /* ---------- format() edge cases ---------- */

  it("formats prefix with default ISO timestamp", () => {
    const logger = CaptureLogger.create(
      { name: "app", timestampFormat: "iso" },
      "debug"
    );
    const result = logger.prefix("info", "boot");
    expect(result).toContain("ℹ️");
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result).toMatch(/\[app\]/);
    expect(result).toMatch(/\[boot\]/);
  });

  it("formats prefix with locale timestamp", () => {
    const logger = CaptureLogger.create(
      { name: "cli", timestampFormat: "locale" },
      "debug"
    );
    const result = logger.prefix("warn");
    expect(result).toContain("⚠️");
    expect(result).toMatch(/\[cli\]/);
  });

  it("formats emoji-only prefix when no name, category, or timestamp", () => {
    const logger = CaptureLogger.create(
      { timestampFormat: false },
      "debug"
    );
    expect(logger.prefix("debug")).toBe("🔍");
    expect(logger.prefix("info")).toBe("ℹ️");
    expect(logger.prefix("warn")).toBe("⚠️");
    expect(logger.prefix("error")).toBe("❌");
    expect(logger.prefix("success")).toBe("✅");
  });

  /* ---------- helper methods ---------- */

  it("routes success() to output", () => {
    const logger = CaptureLogger.create("test", "debug");
    logger.success("done");
    expect(logger.entries).toEqual([
      { level: "success", payload: { message: "done" }, category: undefined },
    ]);
  });

  it("routes debug() with data to output", () => {
    const logger = CaptureLogger.create("test", "debug");
    logger.debug("verbose", { trace: "id-123" });
    expect(logger.entries).toEqual([
      {
        level: "debug",
        payload: { message: "verbose", data: { trace: "id-123" } },
        category: undefined,
      },
    ]);
  });

  /* ---------- error() edge cases ---------- */

  it("handles error() without an error argument", () => {
    const logger = CaptureLogger.create("test", "debug");
    logger.error("something went wrong");
    expect(logger.entries[0]?.category).toBe("something went wrong");
    expect(logger.entries[0]?.payload).toEqual({ error: undefined });
  });

  /* ---------- level filtering ---------- */

  it("defaults to info level when constructed with null logLevel", () => {
    const logger = CaptureLogger.create("test", null);
    logger.debug("should be filtered");
    logger.info("should pass");
    expect(logger.entries.map((e) => e.level)).toEqual(["info"]);
  });

  /* ---------- warn() ---------- */

  it("routes warn() to output with cooked payload", () => {
    const logger = CaptureLogger.create("test", "debug");
    logger.warn("caution", { threshold: 0.9 });
    expect(logger.entries).toEqual([
      {
        level: "warn",
        payload: { message: "caution", data: { threshold: 0.9 } },
        category: undefined,
      },
    ]);
  });

  /* ---------- error() params ---------- */

  it("error() with Error param and no additionalData", () => {
    const logger = CaptureLogger.create("test", "debug");
    const err = new Error("test-error");
    logger.error("Operation failed", err);
    expect(logger.entries[0]?.category).toBe("Operation failed");
    expect(logger.entries[0]?.payload).toEqual({ error: err });
  });

  it("error() with a string as the error param", () => {
    const logger = CaptureLogger.create("test", "debug");
    logger.error("Bad thing", "some string error");
    expect(logger.entries[0]?.category).toBe("Bad thing");
    expect(logger.entries[0]?.payload).toEqual({
      error: "some string error",
    });
  });

  /* ---------- cook() edge cases ---------- */

  it("cook() returns undefined when payload is undefined", () => {
    const logger = CaptureLogger.create("test", "debug");
    expect(logger.cook(undefined)).toBeUndefined();
  });

  it("cook() returns null when payload is null", () => {
    const logger = CaptureLogger.create("test", "debug");
    expect(logger.cook(null)).toBeNull();
  });

  /* ---------- format() edge cases ---------- */

  it("formats prefix with category but no name", () => {
    const logger = CaptureLogger.create({ timestampFormat: false }, "debug");
    expect(logger.prefix("info", "boot")).toBe("ℹ️ [boot]");
  });

  /* ---------- instance isolation ---------- */

  it("two logger instances are isolated from each other", () => {
    const logger1 = CaptureLogger.create("one", "debug");
    const logger2 = CaptureLogger.create("two", "warn");
    logger1.info("only-in-one");
    logger2.info("only-in-two");
    expect(logger1.entries).toHaveLength(1);
    expect(logger2.entries).toHaveLength(0);
    logger2.warn("now-in-two");
    expect(logger2.entries).toHaveLength(1);
    expect(logger1.entries).toHaveLength(1);
  });

  /* ---------- setLogLevel(null) re-init ---------- */

  it("setLogLevel(null) re-initializes from MODALITY_LOG_LEVEL env var", () => {
    const original = process.env.MODALITY_LOG_LEVEL;
    process.env.MODALITY_LOG_LEVEL = "debug";
    try {
      const logger = CaptureLogger.create("test", "error");
      logger.info("skipped");
      expect(logger.entries).toHaveLength(0);
      logger.setLogLevel(null);
      logger.debug("now shows");
      expect(logger.entries.map((e) => e.level)).toEqual(["debug"]);
    } finally {
      process.env.MODALITY_LOG_LEVEL = original;
    }
  });
});
