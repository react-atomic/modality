import { describe, test, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("Google/Gemini API Key Detection", () => {
  test("should detect Google/Gemini API keys", () => {
    const content = 'const apiKey = "AIzaSyDxVlAabc123def456ghi789jkl012mno345";';
    const result = detectAPIKeyLeaks(content);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.startsWith("AIza"))).toBe(true);
  });
});