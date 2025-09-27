import { describe, it, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("GitLab API Keys detection", () => {
  it("should detect GitLab Personal Access Tokens", () => {
    // Testing pattern: /glpat-[0-9a-zA-Z-_]{20}/g
    const content = 'GITLAB_TOKEN=glpat-1234567890abcdef1234';
    const result = detectAPIKeyLeaks(content);
    
    expect(result).toHaveLength(1);
    expect(result[0].match).toBe("glpat-1234567890abcdef1234");
  });
});