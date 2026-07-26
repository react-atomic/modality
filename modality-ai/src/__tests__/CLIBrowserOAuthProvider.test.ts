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
