import { describe, expect, test } from "bun:test";
import { escapeHtml, urlStorageKey, resolveServerIdentity } from "../mcp-oauth-provider";

// ── escapeHtml ──────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  test("escapes ampersand", () => {
    expect(escapeHtml("foo&bar")).toBe("foo&amp;bar");
  });

  test("escapes less-than", () => {
    expect(escapeHtml("a<b")).toBe("a&lt;b");
  });

  test("escapes greater-than", () => {
    expect(escapeHtml("a>b")).toBe("a&gt;b");
  });

  test("escapes double quote", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  test("escapes single quote", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  test("escapes all special characters in one string", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  test("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("returns plain text unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });
});

// ── urlStorageKey ───────────────────────────────────────────────────────────

describe("urlStorageKey", () => {
  test("returns a 12-character hex string", () => {
    const key = urlStorageKey("https://example.com/mcp");
    expect(key).toMatch(/^[0-9a-f]{12}$/);
  });

  test("is deterministic — same input yields same key", () => {
    const url = "https://mcp.figma.com/sse";
    expect(urlStorageKey(url)).toBe(urlStorageKey(url));
  });

  test("different URLs yield different keys", () => {
    expect(urlStorageKey("https://a.com")).not.toBe(urlStorageKey("https://b.com"));
  });

  test("empty string produces a valid key", () => {
    const key = urlStorageKey("");
    expect(key).toMatch(/^[0-9a-f]{12}$/);
  });
});

// ── resolveServerIdentity ───────────────────────────────────────────────────

describe("resolveServerIdentity", () => {
  test("returns identity for exact hostname match (figma.com)", () => {
    const id = resolveServerIdentity("https://figma.com/mcp");
    expect(id).toEqual({ client_name: "Claude Code", client_uri: "https://claude.ai" });
  });

  test("returns identity for subdomain match (mcp.figma.com)", () => {
    const id = resolveServerIdentity("https://mcp.figma.com/mcp");
    expect(id).toEqual({ client_name: "Claude Code", client_uri: "https://claude.ai" });
  });

  test("returns identity for deep subdomain (api.internal.figma.com)", () => {
    const id = resolveServerIdentity("https://api.internal.figma.com/v1");
    expect(id).not.toBeNull();
  });

  test("returns null for unknown hostname", () => {
    expect(resolveServerIdentity("https://example.com/mcp")).toBeNull();
  });

  test("returns null for invalid URL", () => {
    expect(resolveServerIdentity("not-a-url")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(resolveServerIdentity("")).toBeNull();
  });

  test("handles URL with port", () => {
    const id = resolveServerIdentity("https://mcp.figma.com:8080/mcp");
    expect(id).toEqual({ client_name: "Claude Code", client_uri: "https://claude.ai" });
  });
});
