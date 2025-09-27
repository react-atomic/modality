import { describe, test, expect } from "bun:test";
import { detectAPIKeyLeaks, getSafePattern } from "../index";

const { API_KEY_PATTERNS, WHITE_LIST_PATTERNS, EXCLUDE_PATTERNS } =
  getSafePattern();

describe("API_KEY_PATTERNS detection", () => {
  // Test negative cases - should not match placeholder text
  test("should not detect safe patterns", () => {
    const content = "Set your API key: your-api-key";
    const result = detectAPIKeyLeaks(content);

    expect(result).toHaveLength(0);
  });

  test("should handle empty content", () => {
    const result = detectAPIKeyLeaks("");

    expect(result).toHaveLength(0);
  });
  test("Security patterns should be efficient and not vulnerable to ReDoS", async () => {
    const testString = "a".repeat(1000); // Test with long string
    const startTime = Date.now();

    // Test all patterns with a potentially problematic string
    for (const pattern of API_KEY_PATTERNS) {
      pattern.test(testString);
    }

    for (const pattern of WHITE_LIST_PATTERNS) {
      pattern.test(testString);
    }

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    console.log(`✅ Pattern execution time: ${executionTime}ms`);

    // Should complete in reasonable time (less than 100ms for this test)
    expect(executionTime).toBeLessThan(100);

    console.log(
      "✅ Security patterns are efficient and not vulnerable to ReDoS"
    );
  });

  test("Security test configuration should be valid", async () => {
    // Verify API_KEY_PATTERNS are valid regex
    for (let i = 0; i < API_KEY_PATTERNS.length; i++) {
      const pattern = API_KEY_PATTERNS[i];
      expect(pattern).toBeInstanceOf(RegExp);
      expect(() => new RegExp(pattern.source, pattern.flags)).not.toThrow();
    }

    // Verify SAFE_PATTERNS are valid regex
    for (let i = 0; i < WHITE_LIST_PATTERNS.length; i++) {
      const pattern = WHITE_LIST_PATTERNS[i];
      expect(pattern).toBeInstanceOf(RegExp);
      expect(() => new RegExp(pattern.source, pattern.flags)).not.toThrow();
    }

    // Verify EXCLUDE_PATTERNS are strings
    for (const pattern of EXCLUDE_PATTERNS) {
      expect(typeof pattern).toBe("string");
      expect(pattern.length).toBeGreaterThan(0);
    }

    console.log("✅ Security test configuration is valid");
  });
});
