import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { 
  ConsoleMock, 
  consoleMock, 
  setupConsoleMock, 
  cleanupConsoleMock,
  withConsole,
  withConsoleAsync 
} from "../console-mock";

describe("Console Mock Utility", () => {
  let mockInstance: ConsoleMock;

  beforeEach(() => {
    // Create a fresh instance for each test
    mockInstance = new ConsoleMock();
  });

  afterEach(() => {
    // Ensure console is restored after each test
    mockInstance.restore();
    consoleMock.restore();
  });

  describe("ConsoleMock Class", () => {
    test("should mock and restore console methods", () => {
      const originalLog = console.log;
      const originalError = console.error;

      expect(mockInstance.isActive).toBe(false);

      // Mock console
      mockInstance.mock();
      expect(mockInstance.isActive).toBe(true);
      expect(console.log).not.toBe(originalLog);
      expect(console.error).not.toBe(originalError);

      // Restore console
      mockInstance.restore();
      expect(mockInstance.isActive).toBe(false);
      expect(console.log).toBe(originalLog);
      expect(console.error).toBe(originalError);
    });

    test("should handle multiple mock calls safely", () => {
      expect(mockInstance.isActive).toBe(false);

      mockInstance.mock();
      expect(mockInstance.isActive).toBe(true);

      // Should not cause issues when called multiple times
      mockInstance.mock();
      expect(mockInstance.isActive).toBe(true);

      mockInstance.restore();
      expect(mockInstance.isActive).toBe(false);
    });

    test("should handle multiple restore calls safely", () => {
      mockInstance.mock();
      expect(mockInstance.isActive).toBe(true);

      mockInstance.restore();
      expect(mockInstance.isActive).toBe(false);

      // Should not cause issues when called multiple times
      mockInstance.restore();
      expect(mockInstance.isActive).toBe(false);
    });

    test("should provide temporary restore functionality", () => {
      const originalLog = console.log;
      
      mockInstance.mock();
      expect(console.log).not.toBe(originalLog);
      expect(mockInstance.isActive).toBe(true);

      const restoreMock = mockInstance.temporaryRestore();
      expect(console.log).toBe(originalLog);
      expect(mockInstance.isActive).toBe(false);

      restoreMock();
      expect(console.log).not.toBe(originalLog);
      expect(mockInstance.isActive).toBe(true);
    });
  });

  describe("Convenience Functions", () => {
    test("setupConsoleMock and cleanupConsoleMock should work", () => {
      const originalLog = console.log;

      expect(consoleMock.isActive).toBe(false);

      setupConsoleMock();
      expect(consoleMock.isActive).toBe(true);
      expect(console.log).not.toBe(originalLog);

      cleanupConsoleMock();
      expect(consoleMock.isActive).toBe(false);
      expect(console.log).toBe(originalLog);
    });

    test("withConsole should temporarily restore console", () => {
      const originalLog = console.log;
      let loggedValue: string | undefined;

      setupConsoleMock();
      expect(console.log).not.toBe(originalLog);

      const result = withConsole(() => {
        expect(console.log).toBe(originalLog);
        // This would normally be visible if console wasn't mocked
        console.log("test message");
        loggedValue = "executed";
        return "test result";
      });

      expect(result).toBe("test result");
      expect(loggedValue).toBe("executed");
      expect(console.log).not.toBe(originalLog); // Should be mocked again
    });

    test("withConsoleAsync should temporarily restore console for async operations", async () => {
      const originalLog = console.log;

      setupConsoleMock();
      expect(console.log).not.toBe(originalLog);

      const result = await withConsoleAsync(async () => {
        expect(console.log).toBe(originalLog);
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 1));
        console.log("async test message");
        return "async result";
      });

      expect(result).toBe("async result");
      expect(console.log).not.toBe(originalLog); // Should be mocked again
    });
  });

  describe("Console Method Coverage", () => {
    test("should mock all console methods without throwing", () => {
      mockInstance.mock();

      // Test all mocked console methods
      expect(() => console.log("test")).not.toThrow();
      expect(() => console.error("test")).not.toThrow();
      expect(() => console.warn("test")).not.toThrow();
      expect(() => console.info("test")).not.toThrow();
      expect(() => console.debug("test")).not.toThrow();
      expect(() => console.group("test")).not.toThrow();
      expect(() => console.groupEnd()).not.toThrow();
      expect(() => console.groupCollapsed("test")).not.toThrow();
      expect(() => console.dir({})).not.toThrow();
      expect(() => console.table([])).not.toThrow();
      expect(() => console.time("test")).not.toThrow();
      expect(() => console.timeEnd("test")).not.toThrow();
    });
  });
});