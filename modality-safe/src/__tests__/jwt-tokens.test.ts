import { describe, test, expect } from "bun:test";
import { detectAPIKeyLeaks } from "../index";

describe("JWT Token Detection", () => {
  // Test JWT token pattern: eyJ[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+
  test("should detect JWT tokens", () => {
    const content = 'token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"';
    const result = detectAPIKeyLeaks(content);

    expect(result).toHaveLength(1);
    expect(result[0].match).toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });
});