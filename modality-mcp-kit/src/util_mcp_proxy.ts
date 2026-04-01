/**
 * MCP Proxy Utility for WebSocket Server
 *
 * Provides HTTP proxy functionality for MCP servers with caching,
 * schema fixing, and fallback support.
 *
 * Usage: /proxy/:mcpName - proxies requests to configured MCP servers
 * Example: /proxy/figma → http://127.0.0.1:3845/mcp
 */

import { SimpleCache } from "modality-kit";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================
// MCP SERVER CONFIGURATION
// ============================================

interface MCPServerConfig {
  url: string;
  description?: string;
}

export type McpProxyConfig = Record<string, MCPServerConfig>;

// ============================================
// CACHE CONFIGURATION
// ============================================

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Method-specific TTL configuration
const METHOD_TTL_MS: Record<string, number> = {
  initialize: 30 * 60 * 1000, // 30 min
  "tools/list": 5 * 60 * 1000, // 5 min
  "resources/list": 1 * 60 * 1000, // 1 min
  "prompts/list": 5 * 60 * 1000, // 5 min
};

// Cacheable MCP methods (read-only operations)
const CACHEABLE_METHODS = new Set([
  "tools/list",
  "resources/list",
  "prompts/list",
  "tools/call",
]);

// Special methods that should be cached for fallback but NOT served from cache directly
const FALLBACK_ONLY_METHODS = new Set(["initialize"]);

// Per-MCP server cache instances
const serverCaches = new Map<string, SimpleCache<string>>();

function getServerCache(mcpName: string): SimpleCache<string> {
  let cache = serverCaches.get(mcpName);
  if (!cache) {
    cache = new SimpleCache<string>({
      ttlMs: DEFAULT_TTL_MS,
      enableLru: true,
      maxSize: 500,
    });
    serverCaches.set(mcpName, cache);
  }
  return cache;
}

function getMethodsFromRequest(requestData: any): string[] {
  if (!requestData) return [];
  if (Array.isArray(requestData)) {
    return requestData
      .map((r: any) => (r && typeof r === "object" ? r.method : undefined))
      .filter((m: any) => typeof m === "string");
  }
  if (requestData?.method && typeof requestData.method === "string")
    return [requestData.method];
  return [];
}

function isRequestCacheable(requestData: any): boolean {
  const methods = getMethodsFromRequest(requestData);
  if (methods.length === 0) return false;
  return methods.every((m) => CACHEABLE_METHODS.has(m));
}

function isRequestFallbackOnly(requestData: any): boolean {
  const methods = getMethodsFromRequest(requestData);
  if (methods.length === 0) return false;
  return methods.some((m) => FALLBACK_ONLY_METHODS.has(m));
}

function shouldStoreRequestInCache(requestData: any): boolean {
  const methods = getMethodsFromRequest(requestData);
  if (methods.length === 0) return false;
  return methods.every(
    (m) => CACHEABLE_METHODS.has(m) || FALLBACK_ONLY_METHODS.has(m)
  );
}

function getTTLForMethod(method: string): number {
  return METHOD_TTL_MS[method] || DEFAULT_TTL_MS;
}

function getTTLForMethods(methods: string[]): number {
  if (!methods || methods.length === 0) return DEFAULT_TTL_MS;
  const ttls = methods.map((m) => getTTLForMethod(m));
  return Math.min(...ttls);
}

function stripMetaFromParams(params: any): any {
  if (!params || typeof params !== "object") return params;
  const { _meta, ...rest } = params;
  return Object.keys(rest).length > 0 ? rest : null;
}

function generateCacheKey(requestData: any): string | null {
  try {
    if (!requestData) return null;

    if (Array.isArray(requestData)) {
      const parts: string[] = requestData
        .map((r: any) => {
          if (!r || typeof r !== "object") return null;
          const m = r.method;
          if (!m || typeof m !== "string") return null;
          const strippedParams = stripMetaFromParams(r.params);
          const p = strippedParams ? JSON.stringify(strippedParams) : null;
          return p ? `${m}:${p}` : m;
        })
        .filter(Boolean) as string[];
      if (parts.length === 0) return null;
      return parts.join("|");
    }

    const method = requestData?.method;
    if (
      !method ||
      typeof method !== "string" ||
      method === "notifications/initialized"
    )
      return null;

    const strippedParams = stripMetaFromParams(requestData?.params);
    if (!strippedParams) {
      return method;
    }
    return `${method}:${JSON.stringify(strippedParams)}`;
  } catch {
    return null;
  }
}

function replaceCachedResponseId(
  cachedResponse: string,
  requestId: any
): string {
  if (requestId === undefined || requestId === null) return cachedResponse;

  try {
    if (cachedResponse.includes("data:")) {
      const lines = cachedResponse.split("\n");
      const processedLines = lines.map((line) => {
        if (line.startsWith("data: ")) {
          const jsonStr = line.substring(6);
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === "object" && "jsonrpc" in parsed) {
              parsed.id = requestId;
              return "data: " + JSON.stringify(parsed);
            }
          } catch {
            // Not valid JSON, return as-is
          }
        }
        return line;
      });
      return processedLines.join("\n");
    } else {
      const parsed = JSON.parse(cachedResponse);
      if (parsed && typeof parsed === "object" && "jsonrpc" in parsed) {
        parsed.id = requestId;
        return JSON.stringify(parsed);
      }
    }
  } catch {
    // Parse error, return original
  }
  return cachedResponse;
}

function getStaleCache(
  cache: SimpleCache<string>,
  cacheKey: string
): string | null {
  try {
    const entry = cache.get(cacheKey, true) as any;
    if (!entry) return null;
    return typeof entry === "string" ? entry : entry.data;
  } catch {
    return null;
  }
}

function getAnyCacheForMethod(
  cache: SimpleCache<string>,
  method: string
): string | null {
  try {
    let cached = cache.get(method, true) as any;
    if (cached?.data) return cached.data;
    if (typeof cached === "string") return cached;

    const keys = cache.keys();
    for (const k of keys) {
      if (k === method || k.startsWith(`${method}:`)) {
        const entry = cache.get(k, true) as any;
        if (entry?.data) return entry.data;
        if (typeof entry === "string") return entry;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================
// OAUTH TOKEN HELPERS
// ============================================

function getOAuthCachePath(serverUrl: string): string {
  const key = createHash("sha1").update(serverUrl).digest("hex").slice(0, 12);
  return join(homedir(), ".cache", "counter", `${key}.json`);
}

function getStoredOAuthToken(serverUrl: string): string | null {
  try {
    const data = JSON.parse(readFileSync(getOAuthCachePath(serverUrl), "utf8"));
    return data.tokens?.access_token ?? null;
  } catch {
    return null;
  }
}

function clearStoredOAuthTokens(serverUrl: string): boolean {
  const cachePath = getOAuthCachePath(serverUrl);
  try {
    const data = JSON.parse(readFileSync(cachePath, "utf8"));
    delete data.tokens;
    writeFileSync(cachePath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

// ============================================
// TOOL PREFETCH HELPERS
// ============================================

function parseToolsFromBody(body: string): any[] | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.result?.tools) return parsed.result.tools;
  } catch {
    // Try SSE format
    const lines = body.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.substring(6));
          if (parsed?.result?.tools) return parsed.result.tools;
        } catch {}
      }
    }
  }
  return null;
}

async function prefetchAndCacheTools(
  mcpName: string,
  serverUrl: string,
  cache: SimpleCache<string>,
  storedToken?: string | null
): Promise<{ tools: any[] | null; fromCache: boolean }> {
  const cacheKey = "tools/list";

  const cached = cache.get(cacheKey);
  if (cached) {
    const dataLine = cached.match(/^data: (.+)$/m)?.[1] ?? cached;
    return { tools: parseToolsFromBody(dataLine), fromCache: true };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (storedToken) {
      headers.authorization = `Bearer ${storedToken}`;
    }

    const response = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    const body = await response.text();
    const ttl = METHOD_TTL_MS["tools/list"];
    const cacheValue = body.includes("event:") ? body : `event: message\ndata: ${body}\n\n`;
    cache.set(cacheKey, cacheValue, ttl);
    console.log(`[MCP-PROXY] Prefetched and cached tools/list for ${mcpName}`);

    return { tools: parseToolsFromBody(body), fromCache: false };
  } catch (e) {
    console.error(`[MCP-PROXY] Failed to prefetch tools for ${mcpName}:`, e);
    return { tools: null, fromCache: false };
  }
}

// ============================================
// HONO HANDLERS
// ============================================

export type OAuthAllowAccessFn = (
  serverUrl: string,
  mcpName: string
) => Promise<{ status: string; message?: string }>;


/**
 * Hono handler for MCP proxy
 * @param c - Hono context with mcpName param
 * @returns Response proxied from MCP server
 */
export const mcpProxyHandler =
  (MCP_SERVERS: McpProxyConfig, oauthAllowAccess?: OAuthAllowAccessFn) =>
  async (c: any) => {
    const mcpName = c.req.param("mcpName");

    if (!mcpName) {
      return c.json(
        {
          error: "MCP server name is required",
          availableServers: Object.keys(MCP_SERVERS),
        },
        400
      );
    }

    // Handle /_allow sub-route (OAuth access flow)
    if (c.req.path.endsWith("/_allow")) {
      const serverConfig = MCP_SERVERS[mcpName];
      if (!serverConfig) {
        return c.json(
          { error: "MCP server not found", availableServers: Object.keys(MCP_SERVERS) },
          404
        );
      }
      if (!oauthAllowAccess) {
        return c.json({ error: "OAuth not configured for this proxy" }, 501);
      }
      try {
        const result = await oauthAllowAccess(serverConfig.url, mcpName);
        return c.json(result);
      } catch (err: any) {
        return c.json(
          { error: "OAuth failed", message: err.message },
          500
        );
      }
    }

    // Handle /_clear-auth sub-route
    if (c.req.path.endsWith("/_clear-auth")) {
      const serverConfig = MCP_SERVERS[mcpName];
      if (!serverConfig) {
        return c.json(
          { error: "MCP server not found", availableServers: Object.keys(MCP_SERVERS) },
          404
        );
      }
      const cleared = clearStoredOAuthTokens(serverConfig.url);
      return c.json({
        status: cleared ? "cleared" : "no_cache",
        mcpName,
        message: cleared
          ? "OAuth tokens cleared"
          : "No cached OAuth state found",
      });
    }

    // Handle /_tools sub-route — prefetch and return cached tool list
    if (c.req.path.endsWith("/_tools")) {
      const serverConfig = MCP_SERVERS[mcpName];
      if (!serverConfig) {
        return c.json({ error: "MCP server not found", availableServers: Object.keys(MCP_SERVERS) }, 404);
      }
      const cache = getServerCache(mcpName);
      const storedToken = getStoredOAuthToken(serverConfig.url);
      const { tools, fromCache } = await prefetchAndCacheTools(mcpName, serverConfig.url, cache, storedToken);
      return c.json({
        mcpName,
        fromCache,
        count: tools?.length ?? 0,
        tools: tools ?? [],
      });
    }

    // Handle /_cache sub-routes (matched via app.use prefix routing)
    const cachePathMatch = c.req.path.match(/\/_cache(?:\/(.+))?$/);
    if (cachePathMatch) {
      const cache = serverCaches.get(mcpName);
      if (!cache) {
        return c.json({ error: "No cache for this MCP server", keys: [] });
      }
      const cacheKey = cachePathMatch[1]
        ? decodeURIComponent(cachePathMatch[1])
        : undefined;
      if (cacheKey) {
        const entry = cache.get(cacheKey, true);
        if (!entry) {
          return c.json({ error: "Cache key not found", cacheKey }, 404);
        }
        return c.json({ cacheKey, value: entry });
      }
      return c.json({ keys: cache.keys() });
    }

    // Handle CORS preflight
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
          "Access-Control-Allow-Headers":
            "Content-Type, Accept, mcp-session-id, mcp-protocol-version, Authorization",
          "Access-Control-Expose-Headers":
            "mcp-session-id, mcp-protocol-version",
        },
      });
    }

    // GET request - either SSE stream or server info
    if (c.req.method === "GET") {
      const serverConfig = MCP_SERVERS[mcpName];
      if (!serverConfig) {
        return c.json(
          {
            error: "MCP server not found",
            availableServers: Object.keys(MCP_SERVERS),
          },
          404
        );
      }

      const accept = c.req.header("accept") || "";

      // If client wants SSE, proxy the GET request to upstream for SSE connection
      if (accept.includes("text/event-stream")) {
        console.log(`[MCP-PROXY] SSE GET request to ${mcpName}`);

        // Forward headers to upstream
        const incomingHeaders = c.req.raw.headers;
        const upstreamHeaders: Record<string, string> = {
          Accept: "text/event-stream",
        };

        // Forward MCP-specific headers
        const headersToForward = [
          "mcp-session-id",
          "mcp-protocol-version",
          "authorization",
          "last-event-id",
        ];
        for (const header of headersToForward) {
          const value = incomingHeaders.get(header);
          if (value) {
            upstreamHeaders[header] = value;
          }
        }

        // Auto-inject stored OAuth token if no Authorization header present
        if (!upstreamHeaders.authorization) {
          const storedToken = getStoredOAuthToken(serverConfig.url);
          if (storedToken) {
            upstreamHeaders.authorization = `Bearer ${storedToken}`;
          }
        }

        try {
          const upstreamResponse = await fetch(serverConfig.url, {
            method: "GET",
            headers: upstreamHeaders,
            signal: c.req.raw.signal,
          });

          // Forward response headers
          const responseHeaders = new Headers();
          upstreamResponse.headers.forEach((value, key) => {
            if (
              !["transfer-encoding", "content-length", "connection"].includes(
                key.toLowerCase()
              )
            ) {
              responseHeaders.set(key, value);
            }
          });
          responseHeaders.set("Access-Control-Allow-Origin", "*");
          responseHeaders.set(
            "Access-Control-Expose-Headers",
            "mcp-session-id, mcp-protocol-version"
          );

          // Stream the SSE response
          if (upstreamResponse.body) {
            return new Response(upstreamResponse.body, {
              status: upstreamResponse.status,
              headers: responseHeaders,
            });
          }

          return new Response(await upstreamResponse.text(), {
            status: upstreamResponse.status,
            headers: responseHeaders,
          });
        } catch (error: any) {
          console.error(`[MCP-PROXY] SSE GET error:`, error);
          return c.json(
            {
              error: "Failed to establish SSE connection",
              message: error.message,
            },
            502
          );
        }
      }

      // Regular GET - return server info
      const cache = getServerCache(mcpName);
      const basePath = `/proxy/${mcpName}`;
      return c.json({
        mcpName,
        upstream: serverConfig.url,
        description: serverConfig.description,
        endpoints: {
          sse: `${basePath} (GET, Accept: text/event-stream)`,
          rpc: `${basePath} (POST)`,
          tools: `${basePath}/_tools`,
          allow: `${basePath}/_allow`,
          clearAuth: `${basePath}/_clear-auth`,
          cache: `${basePath}/_cache`,
        },
        cache: {
          keys: cache.keys(),
          size: cache.keys().length,
        },
      });
    }

    // POST request - proxy to MCP server with streaming support
    if (c.req.method === "POST") {
      const serverConfig = MCP_SERVERS[mcpName];
      if (!serverConfig) {
        return c.json(
          {
            error: "MCP server not found",
            availableServers: Object.keys(MCP_SERVERS),
          },
          404
        );
      }

      const requestBody = await c.req.text();
      console.log(
        `[MCP-PROXY] Streaming proxy to ${mcpName}, body: ${requestBody.substring(0, 200)}`
      );

      // Check for cached response first (for cacheable methods)
      let requestData: any;
      let cacheKey: string | null = null;
      const cache = getServerCache(mcpName);

      try {
        requestData = JSON.parse(requestBody);

        // Handle notifications/initialized locally
        if (
          requestData === "notifications/initialized" ||
          requestData?.method === "notifications/initialized"
        ) {
          return c.json({ jsonrpc: "2.0", result: null, id: null });
        }

        cacheKey = generateCacheKey(requestData);

        // Check cache for cacheable methods
        if (
          cacheKey &&
          isRequestCacheable(requestData) &&
          !isRequestFallbackOnly(requestData)
        ) {
          const cached = cache.get(cacheKey);
          if (cached) {
            const outBody = replaceCachedResponseId(cached, requestData?.id);
            const isSSE =
              outBody.includes("event:") || outBody.includes("\ndata:");
            return new Response(outBody, {
              status: 200,
              headers: {
                "Content-Type": isSSE
                  ? "text/event-stream"
                  : "application/json",
                "X-Cache-Status": "HIT",
                "X-Cache-Key": cacheKey,
                "Access-Control-Allow-Origin": "*",
              },
            });
          }
        }
      } catch {
        // Invalid JSON, proceed without caching
      }

      // Stream the request to upstream and pipe response back
      try {
        // Forward relevant headers from incoming request to upstream
        const incomingHeaders = c.req.raw.headers;
        const upstreamHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        };

        // Forward MCP-specific headers
        const headersToForward = [
          "mcp-session-id",
          "mcp-protocol-version",
          "authorization",
        ];
        for (const header of headersToForward) {
          const value = incomingHeaders.get(header);
          if (value) {
            upstreamHeaders[header] = value;
            console.log(
              `[MCP-PROXY] Forwarding header: ${header}=${value.substring(0, 50)}`
            );
          }
        }

        // Auto-inject stored OAuth token if no Authorization header present
        if (!upstreamHeaders.authorization) {
          const storedToken = getStoredOAuthToken(serverConfig.url);
          if (storedToken) {
            upstreamHeaders.authorization = `Bearer ${storedToken}`;
            console.log(`[MCP-PROXY] Using stored OAuth token for ${mcpName}`);
          }
        }

        console.log(
          `[MCP-PROXY] Upstream headers:`,
          Object.keys(upstreamHeaders)
        );

        const upstreamResponse = await fetch(serverConfig.url, {
          method: "POST",
          headers: upstreamHeaders,
          body: requestBody,
        });

        // Get all response headers from upstream
        const responseHeaders = new Headers();
        upstreamResponse.headers.forEach((value, key) => {
          // Skip problematic headers
          if (
            !["transfer-encoding", "content-length", "connection"].includes(
              key.toLowerCase()
            )
          ) {
            responseHeaders.set(key, value);
          }
          // Log MCP session header
          if (key.toLowerCase() === "mcp-session-id") {
            console.log(`[MCP-PROXY] Response mcp-session-id: ${value}`);
          }
        });
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set(
          "Access-Control-Expose-Headers",
          "mcp-session-id, mcp-protocol-version"
        );

        console.log(
          `[MCP-PROXY] Upstream response status: ${upstreamResponse.status}`
        );

        // If upstream returns a body stream, pipe it directly
        if (upstreamResponse.body) {
          // For SSE, we need to pass through the stream
          const contentType =
            upstreamResponse.headers.get("content-type") || "";
          const isSSE =
            contentType.includes("text/event-stream") ||
            contentType.includes("application/json");

          if (isSSE) {
            // Clone the response to read for caching while also streaming
            const [streamForResponse, streamForCache] =
              upstreamResponse.body.tee();

            // Cache in background (non-blocking)
            if (cacheKey && shouldStoreRequestInCache(requestData)) {
              (async () => {
                try {
                  const reader = streamForCache.getReader();
                  const chunks: Uint8Array[] = [];
                  let done = false;
                  while (!done) {
                    const result = await reader.read();
                    done = result.done;
                    if (result.value) {
                      chunks.push(result.value);
                    }
                  }
                  const fullBody = new TextDecoder().decode(
                    new Uint8Array(
                      chunks.reduce(
                        (acc, chunk) => [...acc, ...chunk],
                        [] as number[]
                      )
                    )
                  );

                  // Store in cache with proper SSE format
                  const methods = getMethodsFromRequest(requestData);
                  const ttl = getTTLForMethods(methods);
                  let cacheValue = fullBody;
                  if (!fullBody.includes("event:")) {
                    cacheValue = `event: message\ndata: ${fullBody}\n\n`;
                  }
                  cache.set(cacheKey!, cacheValue, ttl);
                  console.log(`[MCP-PROXY] Cached response for ${cacheKey}`);
                } catch (e) {
                  console.error(`[MCP-PROXY] Cache error:`, e);
                }
              })();
            }

            return new Response(streamForResponse, {
              status: upstreamResponse.status,
              headers: responseHeaders,
            });
          }
        }

        // Fallback: buffer and return
        const body = await upstreamResponse.text();
        return new Response(body, {
          status: upstreamResponse.status,
          headers: responseHeaders,
        });
      } catch (error: any) {
        console.error(`[MCP-PROXY] Upstream error:`, error);

        // Try fallback cache
        const methods = getMethodsFromRequest(requestData);
        let fallbackCache = cacheKey ? getStaleCache(cache, cacheKey) : null;

        if (!fallbackCache && methods?.length > 0) {
          for (const method of methods) {
            fallbackCache = getAnyCacheForMethod(cache, method);
            if (fallbackCache) break;
          }
        }

        if (fallbackCache) {
          const outBody = replaceCachedResponseId(
            fallbackCache,
            requestData?.id
          );
          const isSSE =
            outBody.includes("event:") || outBody.includes("\ndata:");
          return new Response(outBody, {
            status: 200,
            headers: {
              "Content-Type": isSSE ? "text/event-stream" : "application/json",
              "X-Cache-Status": "STALE",
              "X-Cache-Reason": "upstream-error",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        return c.json(
          {
            error: "Upstream server unavailable",
            code: error.code || error.name || "UNKNOWN",
            message: error.message,
            upstream: serverConfig.url,
          },
          502
        );
      }
    }

    return c.json({ error: "Method not allowed" }, 405);
  };

/**
 * Hono handler for listing available MCP servers
 * @param c - Hono context
 * @returns List of available MCP servers
 */
export const mcpProxyListHandler =
  (MCP_SERVERS: McpProxyConfig) => (c: any) => {
    const servers = Object.entries(MCP_SERVERS).map(([name, config]) => ({
      name,
      url: config.url,
      description: config.description,
      proxyUrl: `/proxy/${name}`,
    }));

    return c.json({
      servers,
      count: servers.length,
    });
  };

/**
 * Hono handler for MCP proxy cache inspection
 * @param c - Hono context with mcpName param
 * @returns Cache contents for the specified MCP server
 */
export async function mcpProxyCacheHandler(c: any) {
  const mcpName = c.req.param("mcpName");

  if (!mcpName) {
    // Return all caches overview
    const caches: Record<string, string[]> = {};
    serverCaches.forEach((cache, name) => {
      caches[name] = cache.keys();
    });
    return c.json({ caches });
  }

  const cache = serverCaches.get(mcpName);
  if (!cache) {
    return c.json({ error: "No cache for this MCP server", keys: [] });
  }

  const cacheKey = c.req.param("cacheKey");
  if (cacheKey) {
    const entry = cache.get(decodeURIComponent(cacheKey), true);
    if (!entry) {
      return c.json({ error: "Cache key not found", cacheKey }, 404);
    }
    return c.json({ cacheKey, value: entry });
  }

  return c.json({ keys: cache.keys() });
}
