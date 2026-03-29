import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
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
   * 0 (default) picks a random available port.
   * Use a fixed port when registering an OAuth app manually so the redirect
   * URI stays stable across runs (e.g. callbackPort: 9876).
   */
  callbackPort?: number;
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
  private readonly _noOpen: boolean;
  private readonly _cachePath: string | null;
  private _port: number;
  private _server: ReturnType<typeof Bun.serve>;
  private _resolveCode?: (code: string) => void;
  private _rejectCode?: (err: Error) => void;
  private _pendingCode: Promise<string>;
  private _codeVerifier?: string;
  private _clientInfo?: OAuthClientInformationMixed;
  private _tokens?: OAuthTokens;
  private _discoveryState?: OAuthDiscoveryState;

  constructor(options: CLIBrowserOAuthProviderOptions = {}) {
    this._clientName = options.clientName ?? "mcp-cli";
    this._noOpen = options.noOpen ?? false;

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

    // Start server eagerly so redirectUrl is stable before the SDK calls
    // clientMetadata / redirectUrl getters during dynamic client registration.
    this._server = Bun.serve({
      port: options.callbackPort ?? 0,
      fetch: (req) => this._handleCallback(req),
    });
    this._port = this._server.port ?? 0;
  }

  // ── OAuthClientProvider interface ──────────────────────────────────────────

  get redirectUrl(): string {
    return `http://127.0.0.1:${this._port}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: this._clientName,
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code"],
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

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
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

  /** Discovery state captured before registration — available even when registration fails. */
  getDiscoveryState(): OAuthDiscoveryState | undefined {
    return this._discoveryState;
  }

  /** Remove all persisted state for this server (forces re-registration + re-auth on next run). */
  clearCache(): void {
    this._clientInfo = undefined;
    this._tokens = undefined;
    if (this._cachePath) {
      try { writeFileSync(this._cachePath, "{}"); } catch { /* ignore */ }
    }
  }

  /** Stop the local callback HTTP server. Call once auth is complete. */
  stop(): void {
    this._server.stop(true);
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

    if (url.pathname !== "/callback") {
      return new Response("Not found", { status: 404 });
    }

    const error = url.searchParams.get("error");
    if (error) {
      const description = url.searchParams.get("error_description") ?? "";
      this._rejectCode?.(new Error(`OAuth error: ${error} — ${description}`));
      return errorPage(error, description);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      this._rejectCode?.(new Error("OAuth callback missing authorization code"));
      return errorPage("no_code", "No authorization code received.");
    }

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
    <p><code>${error}</code>${description ? `: ${description}` : ""}</p>
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
