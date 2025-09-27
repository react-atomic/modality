import { describe, test, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("GitHub API key detection", () => {
  test("should detect GitHub Personal Access Tokens", () => {
    const content = 'GITHUB_TOKEN=ghp_1234567890abcdef1234567890abcdef123456';
    const result = detectAPIKeyLeaks(content);
    
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.startsWith("ghp_"))).toBe(true);
  });
});
