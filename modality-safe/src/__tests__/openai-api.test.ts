import { describe, test, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("OpenAI API key detection", () => {
  test("should detect OpenAI API keys", () => {
    const content = 'const key = "sk-abcdefghijklmnopqrstuvwxyz123456789012345678901234";';
    const result = detectAPIKeyLeaks(content);
    
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.startsWith("sk-"))).toBe(true);
  });

  test("should detect OpenAI API keys in different formats", () => {
    const testCases = [
      'OPENAI_API_KEY="sk-1234567890abcdef1234567890abcdef1234567890abcdef"',
      'const openaiKey = `sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012`;',
      'openai.api_key = "sk-proj1234567890abcdefghijklmnopqrstuvwxyz1234567890"'
    ];

    testCases.forEach((content) => {
      const result = detectAPIKeyLeaks(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(r => r.match.startsWith("sk-"))).toBe(true);
    });
  });

  test("should not detect invalid OpenAI key patterns", () => {
    const invalidPatterns = [
      'const key = "sk-";', // Too short
      'const key = "sk-invalid-key";', // Wrong format
      'Set your OpenAI key: sk-your-key-here', // Placeholder text
    ];

    invalidPatterns.forEach((content) => {
      const result = detectAPIKeyLeaks(content);
      // Should either have no results or not match the invalid pattern
      if (result.length > 0) {
        expect(result.some(r => r.match === "sk-" || r.match === "sk-invalid-key" || r.match === "sk-your-key-here")).toBe(false);
      }
    });
  });
});