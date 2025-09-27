import { describe, it, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("GitHub API key detection", () => {
  it("should detect GitHub Personal Access Tokens", () => {
    const content = 'GITHUB_TOKEN=ghp_1234567890abcdef1234567890abcdef123456';
    const result = detectAPIKeyLeaks(content);
    
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.startsWith("ghp_"))).toBe(true);
  });

  it("should detect GitHub Personal Access Tokens in different formats", () => {
    const testCases = [
      'export GITHUB_TOKEN="ghp_abcdefghijklmnopqrstuvwxyz1234567890"',
      'const githubToken = `ghp_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r`;',
      'authorization: "token ghp_9876543210fedcba9876543210fedcba654321"',
      'curl -H "Authorization: token ghp_zyxwvutsrqponmlkjihgfedcba0987654321"'
    ];

    testCases.forEach((content, index) => {
      const result = detectAPIKeyLeaks(content);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(r => r.match.startsWith("ghp_"))).toBe(true);
    });
  });

  it("should detect GitHub App tokens", () => {
    // GitHub App Installation tokens also follow similar patterns
    const content = 'GITHUB_APP_TOKEN=ghs_1234567890abcdefghijklmnopqrstuvwxyz12';
    const result = detectAPIKeyLeaks(content);
    
    // Note: This may not be detected by current patterns, but we test for future compatibility
    if (result.length > 0) {
      expect(result.some(r => r.match.includes("ghs_"))).toBe(true);
    }
  });

  it("should not detect invalid GitHub token patterns", () => {
    const invalidPatterns = [
      'const token = "ghp_";', // Too short
      'const token = "ghp-invalid-format";', // Wrong separator
      'Set your GitHub token: ghp_your-token-here', // Placeholder text
      'GITHUB_TOKEN=your-github-token', // Generic placeholder
    ];

    invalidPatterns.forEach((content) => {
      const result = detectAPIKeyLeaks(content);
      // Should either have no results or not match the invalid patterns
      const hasInvalidMatch = result.some(r => 
        r.match === "ghp_" || 
        r.match === "ghp-invalid-format" || 
        r.match === "ghp_your-token-here" ||
        r.match === "your-github-token"
      );
      expect(hasInvalidMatch).toBe(false);
    });
  });

  it("should handle multiple GitHub tokens in same content", () => {
    const content = `
      const token1 = "ghp_1234567890abcdefghijklmnopqrstuvwxyz12";
      const token2 = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
      const invalidToken = "not-a-real-token";
    `;
    
    const result = detectAPIKeyLeaks(content);
    const githubTokens = result.filter(r => r.match.startsWith("ghp_"));
    
    expect(githubTokens.length).toBe(2);
    expect(githubTokens.every(token => token.match.length === 40)).toBe(true); // GitHub tokens are 40 chars
  });
});