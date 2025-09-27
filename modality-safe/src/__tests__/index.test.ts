import { describe, it, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("API_KEY_PATTERNS detection", () => {
  // Test negative cases - should not match placeholder text
  it("should not detect safe patterns", () => {
    const content = 'Set your API key: your-api-key';
    const result = detectAPIKeyLeaks(content);
    
    expect(result).toHaveLength(0);
  });

  it("should handle empty content", () => {
    const result = detectAPIKeyLeaks("");
    
    expect(result).toHaveLength(0);
  });
});
