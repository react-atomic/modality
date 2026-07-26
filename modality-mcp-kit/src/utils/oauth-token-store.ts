/**
 * OAuth Token Store
 *
 * Standalone, sharable helpers for reading and clearing bearer tokens that an
 * external OAuth flow has cached on disk. This module does NOT perform the OAuth
 * handshake itself — it only manages the on-disk token cache written by that flow.
 *
 * Tokens are keyed by a hash of the server URL and stored as JSON at:
 *   <cacheDir>/<sha1(serverUrl)[:12]>.json   →   { tokens: { access_token, ... } }
 *
 * The cache directory defaults to `~/.cache/counter` but can be overridden so the
 * store can be reused across apps.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Default on-disk cache directory: `~/.cache/counter`. */
export const DEFAULT_OAUTH_CACHE_DIR = join(homedir(), ".cache", "counter");

/** Options shared by the token-store helpers. */
export interface OAuthTokenStoreOptions {
  /** Directory holding the token cache files. Defaults to {@link DEFAULT_OAUTH_CACHE_DIR}. */
  cacheDir?: string;
}

/** Resolve the cache file path for a given server URL. */
export function getOAuthCachePath(
  serverUrl: string,
  options: OAuthTokenStoreOptions = {}
): string {
  const key = createHash("sha1").update(serverUrl).digest("hex").slice(0, 12);
  const cacheDir = options.cacheDir ?? DEFAULT_OAUTH_CACHE_DIR;
  return join(cacheDir, `${key}.json`);
}

/** Read the cached access token for a server, or `null` if none is stored. */
export function getStoredOAuthToken(
  serverUrl: string,
  options: OAuthTokenStoreOptions = {}
): string | null {
  try {
    const data = JSON.parse(
      readFileSync(getOAuthCachePath(serverUrl, options), "utf8")
    );
    return data.tokens?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove the cached tokens for a server while preserving the rest of the cache
 * file. Returns `true` when tokens were cleared, `false` when there was nothing
 * to clear (missing/unreadable cache).
 */
export function clearStoredOAuthTokens(
  serverUrl: string,
  options: OAuthTokenStoreOptions = {}
): boolean {
  const cachePath = getOAuthCachePath(serverUrl, options);
  try {
    const data = JSON.parse(readFileSync(cachePath, "utf8"));
    delete data.tokens;
    writeFileSync(cachePath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}
