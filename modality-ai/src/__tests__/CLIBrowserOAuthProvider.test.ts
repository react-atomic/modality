import { describe, expect, test } from "bun:test";
import { CLIBrowserOAuthProvider } from "../mcp-oauth-provider";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a fake Request that looks like an OAuth callback redirect. */
function fakeCallback(
  path: string,
  params: Record<string, string> = {}
): Request {
  const qs = new URLSearchParams(params).toString();
  const url = `http://127.0.0.1:3333${path}${qs ? `?${qs}` : ""}`;
  return new Request(url);
}

// ── Constructor — externalCallback mode ──────────────────────────────────────

describe("CLIBrowserOAuthProvider — externalCallback mode", () => {
  test("does not start a Bun.serve (no port binding)", () => {
    // externalCallback mode — constructor should complete without error
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null, // skip cache
    });
    // stop() should be a no-op — no error thrown
    provider.stop();
  });

  test("redirectUrl uses externalCallback port, host, and path", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 4444, host: "0.0.0.0", path: "/oauth/redirect" },
      noOpen: true,
      serverUrl: null,
    });
    expect(provider.redirectUrl).toBe("http://0.0.0.0:4444/oauth/redirect");
    provider.stop();
  });

  test("defaults host to 127.0.0.1 and path to /callback", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 5555 },
      noOpen: true,
      serverUrl: null,
    });
    expect(provider.redirectUrl).toBe("http://127.0.0.1:5555/callback");
    provider.stop();
  });
});

// ── CSRF state ───────────────────────────────────────────────────────────────

describe("CLIBrowserOAuthProvider — CSRF state", () => {
  test("state() returns a 32-char hex string", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    const state = provider.state();
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    provider.stop();
  });

  test("oauthState getter matches state()", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    expect(provider.oauthState).toBe(provider.state());
    provider.stop();
  });

  test("each instance gets a unique state", () => {
    const a = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    const b = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    expect(a.state()).not.toBe(b.state());
    a.stop();
    b.stop();
  });
});

// ── callbackPath getter ──────────────────────────────────────────────────────

describe("CLIBrowserOAuthProvider — callbackPath", () => {
  test("returns the path from externalCallback", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333, path: "/my/callback" },
      noOpen: true,
      serverUrl: null,
    });
    expect(provider.callbackPath).toBe("/my/callback");
    provider.stop();
  });

  test("defaults to /callback", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    expect(provider.callbackPath).toBe("/callback");
    provider.stop();
  });
});

// ── handleCallback — CSRF validation ─────────────────────────────────────────

describe("CLIBrowserOAuthProvider — handleCallback CSRF", () => {
  test("returns 404 for a path that does not match callbackPath", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    const res = provider.handleCallback(fakeCallback("/wrong-path"));
    expect(res.status).toBe(404);
    provider.stop();
  });

  test("rejects state mismatch with error page", async () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    // Catch the rejected promise to prevent unhandled rejection crash
    const errPromise = provider.waitForCode().catch((e) => e);
    const res = provider.handleCallback(
      fakeCallback("/callback", { state: "wrong-state-value", code: "abc" })
    );
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("state_mismatch");
    const err = await errPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("state mismatch");
    provider.stop();
  });

  test("accepts correct state and resolves with code", async () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    const correctState = provider.state();

    const resPromise = provider.waitForCode();
    const res = provider.handleCallback(
      fakeCallback("/callback", { state: correctState, code: "auth-code-xyz" })
    );
    expect(res.status).toBe(200);

    const code = await resPromise;
    expect(code).toBe("auth-code-xyz");
    provider.stop();
  });

  test("accepts null state (no state param) — forwards to code extraction", async () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });

    const resPromise = provider.waitForCode();
    const res = provider.handleCallback(fakeCallback("/callback", { code: "code-no-state" }));
    expect(res.status).toBe(200);

    const code = await resPromise;
    expect(code).toBe("code-no-state");
    provider.stop();
  });

  test("returns error page when OAuth error is returned", async () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });

    const resPromise = provider.waitForCode().catch((e) => e);
    const res = provider.handleCallback(
      fakeCallback("/callback", { error: "access_denied", error_description: "User denied" })
    );
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("access_denied");

    const err = await resPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("access_denied");
    provider.stop();
  });

  test("returns error page when no code is present", async () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });

    const resPromise = provider.waitForCode().catch((e) => e);
    const res = provider.handleCallback(fakeCallback("/callback"));
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("no_code");

    const err = await resPromise;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("missing authorization code");
    provider.stop();
  });
});

// ── clientMetadata ───────────────────────────────────────────────────────────

describe("CLIBrowserOAuthProvider — clientMetadata", () => {
  test("redirect_uris uses externalCallback host, port, and path", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 7777, host: "10.0.0.1", path: "/auth/cb" },
      noOpen: true,
      serverUrl: null,
    });
    const meta = provider.clientMetadata;
    expect(meta.redirect_uris).toEqual(["http://10.0.0.1:7777/auth/cb"]);
    provider.stop();
  });

  test("defaults client_name to mcp-cli", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    expect(provider.clientMetadata.client_name).toBe("mcp-cli");
    provider.stop();
  });

  test("custom clientName overrides default", () => {
    const provider = new CLIBrowserOAuthProvider({
      clientName: "my-tool",
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    expect(provider.clientMetadata.client_name).toBe("my-tool");
    provider.stop();
  });
});

// ── addClientAuthentication ─────────────────────────────────────────────────

describe("CLIBrowserOAuthProvider — addClientAuthentication", () => {
  test("sets client_id when clientInfo is present", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    provider.saveClientInformation({ client_id: "test-client-id" });

    const params = new URLSearchParams();
    provider.addClientAuthentication(new Headers(), params, "https://example.com/token");

    expect(params.get("client_id")).toBe("test-client-id");
    provider.stop();
  });

  test("includes client_secret when present in clientInfo", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    provider.saveClientInformation({
      client_id: "test-client-id",
      client_secret: "super-secret",
    } as any);

    const params = new URLSearchParams();
    provider.addClientAuthentication(new Headers(), params, "https://example.com/token");

    expect(params.get("client_id")).toBe("test-client-id");
    expect(params.get("client_secret")).toBe("super-secret");
    provider.stop();
  });

  test("does not set client_secret when absent", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    provider.saveClientInformation({ client_id: "test-client-id" });

    const params = new URLSearchParams();
    provider.addClientAuthentication(new Headers(), params, "https://example.com/token");

    expect(params.has("client_secret")).toBe(false);
    provider.stop();
  });

  test("no-op when no clientInfo saved", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });

    const params = new URLSearchParams();
    provider.addClientAuthentication(new Headers(), params, "https://example.com/token");

    expect(params.has("client_id")).toBe(false);
    expect(params.has("client_secret")).toBe(false);
    provider.stop();
  });

  test("uses clientId option over persisted clientInfo", () => {
    const provider = new CLIBrowserOAuthProvider({
      clientId: "inline-client-id",
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });

    const params = new URLSearchParams();
    provider.addClientAuthentication(new Headers(), params, "https://example.com/token");

    expect(params.get("client_id")).toBe("inline-client-id");
    provider.stop();
  });
});

// ── clearCache ──────────────────────────────────────────────────────────────

describe("CLIBrowserOAuthProvider — clearCache", () => {
  test("removes tokens but keeps clientInfo", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    provider.saveClientInformation({ client_id: "cid" });
    provider.saveTokens({ access_token: "tok", token_type: "Bearer" });

    expect(provider.tokens()).toBeDefined();

    provider.clearCache();

    expect(provider.tokens()).toBeUndefined();
    expect(provider.clientInformation()).toEqual({ client_id: "cid" });
    provider.stop();
  });

  test("clearCache when no tokens exist is a no-op", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    provider.clearCache(); // should not throw
    expect(provider.tokens()).toBeUndefined();
    provider.stop();
  });
});

// ── Cache persistence ───────────────────────────────────────────────────────

describe("CLIBrowserOAuthProvider — cache persistence", () => {
  test("serverUrl=null disables cache path", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    // No persistence — save/load should be no-ops but class should work
    provider.saveClientInformation({ client_id: "test" });
    provider.saveTokens({ access_token: "tok", token_type: "Bearer" });
    expect(provider.clientInformation()).toEqual({ client_id: "test" });
    expect(provider.tokens()).toEqual({ access_token: "tok", token_type: "Bearer" });
    provider.stop();
  });

  test("clientId option overrides persisted clientInfo", () => {
    const provider = new CLIBrowserOAuthProvider({
      clientId: "cli-123",
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    expect(provider.clientInformation()).toEqual({ client_id: "cli-123" });
    provider.stop();
  });

  test("clientId option skips cache invalidation when redirect_uris mismatch", () => {
    // Create provider with clientId and save clientInfo with mismatched redirect_uri
    const provider1 = new CLIBrowserOAuthProvider({
      clientId: "explicit-client",
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: "https://test.example.com/mcp",
    });
    // Save clientInfo with a different redirect_uri (simulating stale cache)
    provider1.saveClientInformation({
      client_id: "persisted-client",
      redirect_uris: ["http://wrong-host:9999/callback"],
    } as any);
    provider1.stop();

    // Create new provider with same serverUrl but different port (mismatched redirect_uri)
    const provider2 = new CLIBrowserOAuthProvider({
      clientId: "explicit-client",
      externalCallback: { port: 4444 }, // Different port = different redirect_uri
      noOpen: true,
      serverUrl: "https://test.example.com/mcp",
    });
    // clientInfo should use the clientId option (overrides persisted clientInfo)
    // Cache invalidation is skipped, but clientId takes precedence
    expect(provider2.clientInformation()).toEqual({ client_id: "explicit-client" });
    provider2.stop();
  });

  test("cache invalidation clears clientInfo when clientId not provided and redirect_uris mismatch", () => {
    // Create provider without clientId and save clientInfo
    const provider1 = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: "https://test2.example.com/mcp",
    });
    // Save clientInfo with a specific redirect_uri
    provider1.saveClientInformation({
      client_id: "persisted-client",
      redirect_uris: ["http://127.0.0.1:3333/callback"],
    } as any);
    provider1.stop();

    // Create new provider with same serverUrl but different port (mismatched redirect_uri)
    const provider2 = new CLIBrowserOAuthProvider({
      externalCallback: { port: 4444 }, // Different port = different redirect_uri
      noOpen: true,
      serverUrl: "https://test2.example.com/mcp",
    });
    // clientInfo should be undefined (invalidated due to redirect_uri mismatch)
    expect(provider2.clientInformation()).toBeUndefined();
    provider2.stop();
  });
});

// ── handleCallback — already-settled state ──────────────────────────────────

describe("CLIBrowserOAuthProvider — handleCallback already settled", () => {
  test("returns error page when code already received", async () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    const state = provider.state();

    // First callback succeeds
    const resPromise = provider.waitForCode();
    provider.handleCallback(fakeCallback("/callback", { state, code: "first-code" }));
    await resPromise;

    // Second callback returns error
    const res2 = provider.handleCallback(fakeCallback("/callback", { state, code: "second-code" }));
    expect(res2.status).toBe(400);
    const body = await res2.text();
    expect(body).toContain("already_completed");
    provider.stop();
  });
});

// ── codeVerifier ────────────────────────────────────────────────────────────

describe("CLIBrowserOAuthProvider — codeVerifier", () => {
  test("throws when no verifier saved", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    expect(() => provider.codeVerifier()).toThrow("No PKCE code verifier saved");
    provider.stop();
  });

  test("returns saved verifier", () => {
    const provider = new CLIBrowserOAuthProvider({
      externalCallback: { port: 3333 },
      noOpen: true,
      serverUrl: null,
    });
    provider.saveCodeVerifier("verifier-abc");
    expect(provider.codeVerifier()).toBe("verifier-abc");
    provider.stop();
  });
});
