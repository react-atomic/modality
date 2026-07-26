import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  getOAuthCachePath,
  getStoredOAuthToken,
  clearStoredOAuthTokens,
  DEFAULT_OAUTH_CACHE_DIR,
} from "../utils/oauth-token-store";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic SHA-1 prefix for a given URL (first 12 hex chars). */
function sha1Prefix(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

const TMP = join(__dirname, ".tmp-oauth-token-store-test");

function cacheFile(serverUrl: string): string {
  return join(TMP, `${sha1Prefix(serverUrl)}.json`);
}

function writeCache(serverUrl: string, data: Record<string, unknown>): void {
  writeFileSync(cacheFile(serverUrl), JSON.stringify(data, null, 2));
}

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

// ── getOAuthCachePath ────────────────────────────────────────────────────────

describe("getOAuthCachePath", () => {
  test("returns a path inside the default cache dir", () => {
    const path = getOAuthCachePath("https://example.com/mcp");
    expect(path).toStartWith(DEFAULT_OAUTH_CACHE_DIR);
    expect(path).toEndWith(".json");
  });

  test("hash is 12 hex chars derived from sha1(serverUrl)", () => {
    const path = getOAuthCachePath("https://example.com/mcp");
    const filename = path.split("/").pop()!;
    expect(filename).toBe(`${sha1Prefix("https://example.com/mcp")}.json`);
  });

  test("same URL always produces the same path", () => {
    const a = getOAuthCachePath("https://a.com");
    const b = getOAuthCachePath("https://a.com");
    expect(a).toBe(b);
  });

  test("different URLs produce different paths", () => {
    const a = getOAuthCachePath("https://a.com");
    const b = getOAuthCachePath("https://b.com");
    expect(a).not.toBe(b);
  });

  test("custom cacheDir overrides the default", () => {
    const path = getOAuthCachePath("https://x.com", { cacheDir: "/tmp/test" });
    expect(path).toStartWith("/tmp/test");
    expect(path).not.toContain(DEFAULT_OAUTH_CACHE_DIR);
  });

  test("handles empty string URL deterministically", () => {
    const a = getOAuthCachePath("");
    const b = getOAuthCachePath("");
    expect(a).toBe(b);
    expect(a).toEndWith(".json");
  });
});

// ── getStoredOAuthToken ──────────────────────────────────────────────────────

describe("getStoredOAuthToken", () => {
  test("returns access_token from a valid cache file", () => {
    const url = "https://token-test.com/mcp";
    writeCache(url, { tokens: { access_token: "abc-123" } });
    expect(getStoredOAuthToken(url, { cacheDir: TMP })).toBe("abc-123");
  });

  test("returns null when cache file does not exist", () => {
    expect(getStoredOAuthToken("https://no-cache.com", { cacheDir: TMP })).toBeNull();
  });

  test("returns null when cache file contains malformed JSON", () => {
    const url = "https://malformed.com";
    writeFileSync(cacheFile(url), "{ broken json");
    expect(getStoredOAuthToken(url, { cacheDir: TMP })).toBeNull();
  });

  test("returns null when cache file has no tokens key", () => {
    writeCache("https://no-tokens.com", { clientInfo: { client_id: "x" } });
    expect(getStoredOAuthToken("https://no-tokens.com", { cacheDir: TMP })).toBeNull();
  });

  test("returns null when tokens object has no access_token", () => {
    writeCache("https://empty-tokens.com", { tokens: { refresh_token: "rt" } });
    expect(getStoredOAuthToken("https://empty-tokens.com", { cacheDir: TMP })).toBeNull();
  });

  test("defaults to DEFAULT_OAUTH_CACHE_DIR when options omitted", () => {
    // Should not throw — just returns null for a URL that definitely has no cache
    const result = getStoredOAuthToken("https://absent.com");
    expect(result).toBeNull();
  });

  test("reads from DEFAULT_OAUTH_CACHE_DIR when no options provided and data exists", () => {
    const url = "https://default-dir-test.com";
    const key = sha1Prefix(url);
    const realPath = join(DEFAULT_OAUTH_CACHE_DIR, `${key}.json`);

    // Write directly to the real default dir, then read back via getStoredOAuthToken
    // (no cacheDir option — exercises the default path with real data)
    mkdirSync(DEFAULT_OAUTH_CACHE_DIR, { recursive: true });
    writeFileSync(realPath, JSON.stringify({ tokens: { access_token: "default-dir-token" } }));

    try {
      const result = getStoredOAuthToken(url); // no options
      expect(result).toBe("default-dir-token");
    } finally {
      rmSync(realPath, { force: true });
    }
  });
});

// ── clearStoredOAuthTokens ───────────────────────────────────────────────────

describe("clearStoredOAuthTokens", () => {
  test("returns true and removes the tokens key", () => {
    const url = "https://clear-test.com";
    writeCache(url, {
      tokens: { access_token: "secret" },
      clientInfo: { client_id: "keep-me" },
    });

    const cleared = clearStoredOAuthTokens(url, { cacheDir: TMP });
    expect(cleared).toBe(true);

    // tokens should be gone, clientInfo preserved
    const data = JSON.parse(readFileSync(cacheFile(url), "utf8"));
    expect(data.tokens).toBeUndefined();
    expect(data.clientInfo).toEqual({ client_id: "keep-me" });
  });

  test("returns false when cache file does not exist", () => {
    expect(clearStoredOAuthTokens("https://does-not-exist.com", { cacheDir: TMP })).toBe(false);
  });

  test("returns false when cache file contains malformed JSON", () => {
    const url = "https://clear-malformed.com";
    writeFileSync(cacheFile(url), "not json");
    expect(clearStoredOAuthTokens(url, { cacheDir: TMP })).toBe(false);
  });

  test("returns true even if there were no tokens to clear", () => {
    const url = "https://clear-no-tokens.com";
    writeCache(url, { clientInfo: { client_id: "x" } });

    const cleared = clearStoredOAuthTokens(url, { cacheDir: TMP });
    expect(cleared).toBe(true);

    const data = JSON.parse(readFileSync(cacheFile(url), "utf8"));
    expect(data).toEqual({ clientInfo: { client_id: "x" } });
  });

  test("defaults to DEFAULT_OAUTH_CACHE_DIR and returns false for missing URL", () => {
    // Exercises the default cacheDir path — no file exists, so returns false
    expect(clearStoredOAuthTokens("https://clear-default-dir.com")).toBe(false);
  });
});

// ── DEFAULT_OAUTH_CACHE_DIR ──────────────────────────────────────────────────

describe("DEFAULT_OAUTH_CACHE_DIR", () => {
  test("ends with .cache/counter", () => {
    expect(DEFAULT_OAUTH_CACHE_DIR).toEndWith(".cache/counter");
  });
});
