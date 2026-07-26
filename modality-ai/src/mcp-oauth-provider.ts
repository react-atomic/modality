import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthClientProvider, OAuthDiscoveryState, AddClientAuthentication } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

interface CLIBrowserOAuthProviderOptions {
  /** Display name registered with the OAuth server. Default: "mcp-cli" */
  clientName?: string;
  /**
   * Pre-registered OAuth client ID.
   * When provided, skips dynamic client registration (RFC 7591) entirely.
   */
  clientId?: string;
  /**
   * Port for the local callback server.
   * Defaults to 9876 for a stable redirect_uri across runs.
   * Ignored when `externalCallback` is set.
   */
  callbackPort?: number;
  /**
   * Route the OAuth redirect through an existing HTTP server instead of
   * starting a local Bun.serve. When set, the provider binds no port of its
   * own — the host app must forward the redirect request to `handleCallback()`.
   * `port`/`path`/`host` define the advertised redirect_uri and must match the
   * host server (defaults: host "127.0.0.1", path "/callback").
   * Correlate the inbound callback to this provider via `oauthState`.
   */
  externalCallback?: { port: number; path?: string; host?: string };
  /**
   * Invoked with the full authorization URL just before the browser opens.
   * Lets the host correlate the later callback to this provider (e.g. by
   * reading the `state` query param, which equals `oauthState`).
   */
  onAuthorizationUrl?: (url: URL) => void;
  /**
   * Skip opening the system browser automatically.
   * When true the authorization URL is printed but not launched.
   * Useful for headless / CI environments.
   */
  noOpen?: boolean;
  /**
   * MCP server URL used to derive a unique cache key via urlStorageKey().
   * Each server gets its own cache entry so re-runs skip dynamic registration.
   * Pass null to disable persistence entirely.
   */
  serverUrl?: string | null;
}

/**
 * Per-server OAuth client identity override.
 * Some MCP servers whitelist specific client_name values during dynamic
 * registration — use this map to supply the expected identity automatically.
 */
interface ServerClientIdentity {
  client_name: string;
  client_uri: string;
}

/**
 * Hostname-suffix → identity whitelist.
 * A key of "figma.com" matches "mcp.figma.com", "api.figma.com", etc.
 */
const SERVER_IDENTITY_WHITELIST: Record<string, ServerClientIdentity> = {
  "figma.com": {
    client_name: "Claude Code",
    client_uri: "https://claude.ai",
  },
};

// Persisted shape written to ~/.cache/inspect-mcp/<key>.json
interface PersistedState {
  clientInfo?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
}

/**
 * OAuthClientProvider for CLI tools.
 *
 * Implements the MCP SDK OAuthClientProvider interface for browser-based
 * Authorization Code + PKCE flows. Designed to be passed directly to
 * StreamableHTTPClientTransport as `authProvider`.
 *
 * Persists clientInfo + tokens to disk so re-runs skip dynamic registration
 * and the browser prompt (until the token expires).
 *
 * Usage:
 *   const provider = new CLIBrowserOAuthProvider({ clientName: "my-cli", serverUrl: "https://mcp.figma.com/mcp" });
 *   const transport = new StreamableHTTPClientTransport(url, { authProvider: provider });
 *   const client = new Client(...);
 *
 *   try {
 *     await client.connect(transport);
 *   } catch (err) {
 *     if (err instanceof UnauthorizedError) {
 *       const code = await provider.waitForCode();
 *       await transport.finishAuth(code);
 *       await client.connect(transport); // retry with token now in provider
 *     }
 *   }
 *
 *   provider.stop();
 */
export class CLIBrowserOAuthProvider implements OAuthClientProvider {
  private readonly _clientName: string;
  private readonly _serverIdentity: ServerClientIdentity | null;
  private readonly _noOpen: boolean;
  private readonly _cachePath: string | null;
  private readonly _callbackPath: string;
  private readonly _callbackHost: string;
  private readonly _state: string;
  private readonly _onAuthorizationUrl?: (url: URL) => void;
  private _port: number;
  private _server?: ReturnType<typeof Bun.serve>;
  private _resolveCode?: (code: string) => void;
  private _rejectCode?: (err: Error) => void;
  private _pendingCode: Promise<string>;
  private _codeSettled = false;
  private _codeVerifier?: string;
  private _clientInfo?: OAuthClientInformationMixed;
  private _tokens?: OAuthTokens;
  private _discoveryState?: OAuthDiscoveryState;

  constructor(options: CLIBrowserOAuthProviderOptions = {}) {
    this._clientName = options.clientName ?? "mcp-cli";
    this._noOpen = options.noOpen ?? false;
    this._onAuthorizationUrl = options.onAuthorizationUrl;
    this._state = randomBytes(16).toString("hex");
    this._callbackPath = options.externalCallback?.path ?? "/callback";
    this._callbackHost = options.externalCallback?.host ?? "127.0.0.1";

    // Resolve server-specific client identity from the whitelist
    this._serverIdentity = options.serverUrl
      ? resolveServerIdentity(options.serverUrl)
      : null;

    // Resolve cache file path
    if (options.serverUrl === null) {
      this._cachePath = null;
    } else {
      const key = options.serverUrl ? urlStorageKey(options.serverUrl) : "default";
      const dir = join(homedir(), ".cache", "counter");
      mkdirSync(dir, { recursive: true });
      this._cachePath = join(dir, `${key}.json`);
    }

    // Load persisted state before starting the server so clientInformation()
    // returns the saved client_id immediately — the SDK checks this first and
    // skips dynamic registration when it has a value.
    const saved = this._loadCache();
    this._clientInfo = saved.clientInfo;
    this._tokens = saved.tokens;

    // --client-id flag overrides persisted clientInfo
    if (options.clientId) {
      this._clientInfo = { client_id: options.clientId };
    }

    this._pendingCode = new Promise<string>((resolve, reject) => {
      this._resolveCode = resolve;
      this._rejectCode = reject;
    });

    // Resolve redirectUrl before the SDK calls clientMetadata / redirectUrl
    // getters during dynamic client registration.
    if (options.externalCallback) {
      // Host-managed mode: bind no port of our own — the host server owns the
      // port and forwards the redirect to handleCallback(). redirect_uri stays
      // stable across runs, so cached clientInfo survives (no re-registration).
      this._port = options.externalCallback.port;
    } else {
      // Start our own callback server eagerly so redirectUrl is stable before
      // registration. Default to port 9876 for a stable redirect_uri across
      // runs — random ports cause re-registration every run and redirect_uri
      // mismatch on token exchange.
      this._server = Bun.serve({
        port: options.callbackPort ?? 9876,
        fetch: (req) => this._handleCallback(req),
      });
      this._port = this._server.port ?? 9876;
    }

    // Invalidate cached clientInfo if its redirect_uris don't match the current
    // redirectUrl — e.g. after switching --callback-port or fixing a broken cache.
    if (this._clientInfo) {
      const uris: string[] = (this._clientInfo as Record<string, unknown>).redirect_uris as string[] ?? [];
      if (!uris.includes(this.redirectUrl)) {
        this._clientInfo = undefined;
      }
    }
  }

  // ── OAuthClientProvider interface ──────────────────────────────────────────

  get redirectUrl(): string {
    return `http://${this._callbackHost}:${this._port}${this._callbackPath}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    const identity = this._serverIdentity;
    return {
      client_name: identity?.client_name ?? this._clientName,
      ...(identity?.client_uri ? { client_uri: identity.client_uri } : {}),
      // Exact port in redirect_uri so token exchange matches registration.
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this._clientInfo;
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this._clientInfo = info;
    this._persistCache();
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
    this._persistCache();
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this._discoveryState = state;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this._discoveryState;
  }

  saveCodeVerifier(verifier: string): void {
    this._codeVerifier = verifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) throw new Error("No PKCE code verifier saved");
    return this._codeVerifier;
  }

  /**
   * Custom client authentication for token exchange.
   *
   * Figma's dynamic registration returns `token_endpoint_auth_method: "none"` yet
   * also issues a `client_secret`. The MCP SDK honours the registered
   * `token_endpoint_auth_method` and therefore sends only `client_id`, which Figma
   * rejects. When a `client_secret` is present we always send it as
   * `client_secret_post` so the credentials reach Figma regardless of whatever
   * auth-method string the registration response contained.
   */
  readonly addClientAuthentication: AddClientAuthentication = (
    _headers: Headers,
    params: URLSearchParams,
  ): void => {
    const info = this._clientInfo;
    if (!info) return;
    params.set("client_id", info.client_id);
    const secret = (info as Record<string, unknown>).client_secret as string | undefined;
    if (secret) {
      params.set("client_secret", secret);
    }
  };

  /**
   * CSRF `state` echoed back on the redirect. The SDK reads this via the
   * optional `state()` hook and appends it to the authorization request; the
   * callback validates it. Also used by host apps to correlate an external
   * callback to this provider instance.
   */
  state(): string {
    return this._state;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this._onAuthorizationUrl?.(authorizationUrl);
    const url = authorizationUrl.toString();
    if (this._noOpen) {
      console.error("\n🔐 Authorization required. Open this URL in your browser:\n");
      console.error(`   ${url}\n`);
    } else {
      console.error("\n🔐 Opening browser for authorization...");
      console.error(`   If the browser does not open, visit:\n   ${url}\n`);
      openBrowser(url);
    }
    console.error(`⏳ Waiting for you to approve access in the browser...`);
    console.error(`   (callback listening on ${this.redirectUrl})\n`);
  }

  // ── Public helpers ──────────────────────────────────────────────────────────

  /**
   * Resolves with the authorization code once the browser redirect completes.
   */
  waitForCode(): Promise<string> {
    return this._pendingCode;
  }

  /** CSRF state for this flow — key an external callback route by this value. */
  get oauthState(): string {
    return this.state();
  }

  /** Advertised redirect path — the route an external host server must expose. */
  get callbackPath(): string {
    return this._callbackPath;
  }

  /**
   * Handle an OAuth redirect request forwarded from an external host server
   * (externalCallback mode). Resolves waitForCode() and returns the page to
   * render in the browser tab.
   */
  handleCallback(req: Request): Response {
    return this._handleCallback(req);
  }

  /** Discovery state captured before registration — available even when registration fails. */
  getDiscoveryState(): OAuthDiscoveryState | undefined {
    return this._discoveryState;
  }

  /** Clear cached tokens only — forces browser re-auth on next run while keeping client registration. */
  clearCache(): void {
    this._tokens = undefined;
    this._persistCache();
  }

  /**
   * Stop the local callback HTTP server. Call once auth is complete.
   * No-op in externalCallback mode, where the host owns the server.
   */
  stop(): void {
    this._server?.stop(true);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _loadCache(): PersistedState {
    if (!this._cachePath) return {};
    try {
      const raw = readFileSync(this._cachePath, "utf8");
      return JSON.parse(raw) as PersistedState;
    } catch {
      return {};
    }
  }

  private _persistCache(): void {
    if (!this._cachePath) return;
    const state: PersistedState = {};
    if (this._clientInfo) state.clientInfo = this._clientInfo;
    if (this._tokens) state.tokens = this._tokens;
    try {
      writeFileSync(this._cachePath, JSON.stringify(state, null, 2));
    } catch { /* ignore write errors */ }
  }

  private _handleCallback(req: Request): Response {
    const url = new URL(req.url);

    if (url.pathname !== this._callbackPath) {
      return new Response("Not found", { status: 404 });
    }

    // Subsequent callbacks on an already-settled promise are errors.
    if (this._codeSettled) {
      return errorPage("already_completed", "Authorization code was already received.");
    }

    // Reject a mismatched state to block CSRF / cross-flow callback delivery.
    const returnedState = url.searchParams.get("state");
    if (returnedState !== null && returnedState !== this._state) {
      this._codeSettled = true;
      this._rejectCode?.(new Error("OAuth state mismatch"));
      return errorPage("state_mismatch", "State parameter did not match.");
    }

    const error = url.searchParams.get("error");
    if (error) {
      const description = url.searchParams.get("error_description") ?? "";
      this._codeSettled = true;
      this._rejectCode?.(new Error(`OAuth error: ${error} — ${description}`));
      return errorPage(error, description);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      this._codeSettled = true;
      this._rejectCode?.(new Error("OAuth callback missing authorization code"));
      return errorPage("no_code", "No authorization code received.");
    }

    this._codeSettled = true;
    this._resolveCode?.(code);
    return successPage();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function successPage(): Response {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authentication successful</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5;
      color: #1a1a1a;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      padding: 2.5rem 3rem;
      text-align: center;
      box-shadow: 0 2px 16px rgba(0,0,0,.08);
      max-width: 420px;
      width: 90%;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: .5rem; }
    p { font-size: .9rem; color: #555; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <span class="icon">✅</span>
    <h1>Authentication successful</h1>
    <p>You're connected. You can close this tab and return to the terminal.</p>
  </div>
</body>
</html>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html" } });
}

/** Escape HTML special characters to prevent XSS from attacker-controlled strings. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorPage(error: string, description: string): Response {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authentication failed</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5;
      color: #1a1a1a;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      padding: 2.5rem 3rem;
      text-align: center;
      box-shadow: 0 2px 16px rgba(0,0,0,.08);
      max-width: 420px;
      width: 90%;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: .5rem; }
    p { font-size: .9rem; color: #555; line-height: 1.5; }
    code { font-family: monospace; background: #f0f0f0; padding: .1em .4em; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="icon">❌</span>
    <h1>Authentication failed</h1>
    <p><code>${escapeHtml(error)}</code>${description ? `: ${escapeHtml(description)}` : ""}</p>
  </div>
</body>
</html>`;
  return new Response(body, { status: 400, headers: { "Content-Type": "text/html" } });
}

function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin") {
      Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
    } else if (process.platform === "win32") {
      Bun.spawn(["cmd", "/c", "start", url], { stdout: "ignore", stderr: "ignore" });
    } else {
      Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" });
    }
  } catch {
    // Silent — user can manually open the printed URL
  }
}

/** Short stable hash of a string — used to derive a cache file name from a URL. */
function urlStorageKey(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

/**
 * Returns a whitelisted client identity for the given server URL, or null
 * if none matches. Matching is hostname-suffix based: a key "figma.com"
 * matches "mcp.figma.com", "api.figma.com", etc.
 */
function resolveServerIdentity(serverUrl: string): ServerClientIdentity | null {
  let hostname: string;
  try {
    hostname = new URL(serverUrl).hostname;
  } catch {
    return null;
  }
  for (const [key, identity] of Object.entries(SERVER_IDENTITY_WHITELIST)) {
    if (hostname === key || hostname.endsWith(`.${key}`)) {
      return identity;
    }
  }
  return null;
}
