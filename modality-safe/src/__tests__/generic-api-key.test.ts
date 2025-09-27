import { describe, it, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("Generic API Key Patterns detection", () => {
  it("should detect generic api_key pattern", () => {
    // Testing pattern: /api[_-]?key["\s]*[:=]["\s]*[a-zA-Z0-9-_]{20,}/gi
    const content = 'const apiKey = "abc123def456ghi789jkl012mno345pqr";';
    const result = detectAPIKeyLeaks(content);
    
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.includes("abc123def456ghi789jkl012mno345pqr"))).toBe(true);
  });

  it("should detect generic secret_key pattern", () => {
    // Testing pattern: /secret[_-]?key["\s]*[:=]["\s]*[a-zA-Z0-9-_]{20,}/gi
    const content = 'SECRET_KEY=xyz789abc123def456ghi789jkl012';
    const result = detectAPIKeyLeaks(content);
    
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.includes("xyz789abc123def456ghi789jkl012"))).toBe(true);
  });

  it("should detect bearer token pattern", () => {
    // Testing pattern: /bearer[\s]+[a-zA-Z0-9-_]{20,}/gi
    const content = 'Authorization: Bearer abcd1234efgh5678ijkl9012mnop3456';
    const result = detectAPIKeyLeaks(content);
    
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.includes("abcd1234efgh5678ijkl9012mnop3456"))).toBe(true);
  });
});