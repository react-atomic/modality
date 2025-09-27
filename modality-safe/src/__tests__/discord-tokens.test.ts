import { describe, it, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("Discord Token Detection", () => {
  // Test Discord token pattern: [MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}
  it("should detect Discord tokens", () => {
    const content = 'const token = "MFAKE567890123456789012X.FAKE01.123456789012345678901234567";';
    const result = detectAPIKeyLeaks(content);

    expect(result.length).toBeGreaterThan(0);
    expect(result.some(r => r.match.startsWith("MFAKE"))).toBe(true);
  });
});