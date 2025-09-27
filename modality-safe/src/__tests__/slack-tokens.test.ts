import { describe, it, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("Slack Token Detection", () => {
  // Test Slack token pattern: xox[bpoa]-[0-9a-zA-Z-]+
  it("should detect Slack tokens", () => {
    const content = 'const token = "xoxb-1234567890-FAKE-TOKEN-FOR-TESTING-ONLY";';
    const result = detectAPIKeyLeaks(content);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.startsWith("xoxb-"))).toBe(true);
  });
});