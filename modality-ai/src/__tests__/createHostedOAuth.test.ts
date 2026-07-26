import { describe, expect, test } from "bun:test";
import { createHostedOAuth } from "../mcp-oauth-provider";

// ── Helpers ──────────────────────────────────────────────────────────────────

const CALLBACK_URL = "http://127.0.0.1:65533/oauth/callback";

/** Build a fake callback Request with the given query params. */
function callbackRequest(params: Record<string, string> = {}): Request {
  const qs = new URLSearchParams(params).toString();
  return new Request(`${CALLBACK_URL}${qs ? `?${qs}` : ""}`);
}

function makeOAuth(getPort: () => number | Promise<number> = () => 65533) {
  return createHostedOAuth({
    callbackPath: "/oauth/callback",
    clientName: "mcp-proxy",
    getPort,
  });
}

// ── Shape ────────────────────────────────────────────────────────────────────

describe("createHostedOAuth — shape", () => {
  test("exposes handleCallback and allowAccess functions", () => {
    const oauth = makeOAuth();
    expect(typeof oauth.handleCallback).toBe("function");
    expect(typeof oauth.allowAccess).toBe("function");
  });

  test("getPort is lazy — not called at creation", () => {
    let calls = 0;
    makeOAuth(() => {
      calls++;
      return 65533;
    });
    expect(calls).toBe(0);
  });

  test("allowAccess invokes getPort once and returns a Promise", async () => {
    let calls = 0;
    const oauth = makeOAuth(() => {
      calls++;
      return 65533;
    });
    // Unroutable server URL — the flow fails fast; we only assert getPort fired.
    const p = oauth.allowAccess("http://127.0.0.1:1/mcp", "test").catch(() => "errored");
    expect(p).toBeInstanceOf(Promise);
    await p;
    expect(calls).toBe(1);
  });
});

// ── handleCallback — correlation miss-path ───────────────────────────────────

describe("createHostedOAuth — handleCallback correlation", () => {
  test("unknown state → 400 (no pending flow)", () => {
    const oauth = makeOAuth();
    const res = oauth.handleCallback(callbackRequest({ code: "x", state: "UNKNOWN" }));
    expect(res.status).toBe(400);
  });

  test("missing state → 400", () => {
    const oauth = makeOAuth();
    const res = oauth.handleCallback(callbackRequest({ code: "x" }));
    expect(res.status).toBe(400);
  });
});

// ── handleCallback — OAuthCallbackInput polymorphism ─────────────────────────

describe("createHostedOAuth — handleCallback input shapes", () => {
  test("accepts a raw Request (Bun.serve style)", () => {
    const oauth = makeOAuth();
    const res = oauth.handleCallback(callbackRequest({ state: "UNKNOWN" }));
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(400);
  });

  test("accepts a Hono-Context-shaped object ({ req: { raw } })", () => {
    const oauth = makeOAuth();
    const ctx = { req: { raw: callbackRequest({ state: "UNKNOWN" }) } };
    const res = oauth.handleCallback(ctx);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(400);
  });

  test("works as a detached reference — no this-binding needed", () => {
    const oauth = makeOAuth();
    const bare = oauth.handleCallback;
    const res = bare(callbackRequest({ state: "UNKNOWN" }));
    expect(res.status).toBe(400);
  });
});
