import { describe, it, expect } from "bun:test";
import { mcpProxyHandler } from "../util_mcp_proxy";

const MCP_SERVERS = {
  myServer: { url: "http://localhost:9999", description: "Test server" },
};

function makeCtx(path: string, method = "GET") {
  const mcpName = path.split("/").filter(Boolean)[1]; // e.g. "myServer"
  return {
    req: {
      path,
      method,
      param: (key: string) => (key === "mcpName" ? mcpName : undefined),
      header: (_key: string) => "",
      raw: { headers: { get: () => null } },
      text: async () => "",
    },
    json: (data: any, status = 200) => ({ data, status }),
  };
}

describe("mcpProxyHandler — /_cache routing", () => {
  const handler = mcpProxyHandler(MCP_SERVERS);

  it("non-cache GET initializes server cache and returns server info", async () => {
    const c = makeCtx("/proxy/myServer");
    const res: any = await handler(c);
    expect(res.data.mcpName).toBe("myServer");
    expect(Array.isArray(res.data.cache.keys)).toBe(true);
  });

  it("/_cache path returns empty keys after cache initialized", async () => {
    // Prime the cache by running a normal GET first
    await handler(makeCtx("/proxy/myServer"));

    const c = makeCtx("/proxy/myServer/_cache");
    const res: any = await handler(c);
    expect(res.data.keys).toEqual([]);
  });

  it("/_cache/someKey returns 404 when key does not exist", async () => {
    // Prime the cache
    await handler(makeCtx("/proxy/myServer"));

    const c = makeCtx("/proxy/myServer/_cache/someKey");
    const res: any = await handler(c);
    expect(res.status).toBe(404);
    expect(res.data.error).toBe("Cache key not found");
    expect(res.data.cacheKey).toBe("someKey");
  });

  it("non-cache path does NOT enter cache branch", async () => {
    const c = makeCtx("/proxy/myServer");
    const res: any = await handler(c);
    // Cache branch would return { error: "No cache..." } or { keys: [] }
    // Proxy branch returns server info
    expect(res.data.error).toBeUndefined();
    expect(res.data.mcpName).toBe("myServer");
  });

  it("unknown server on /_cache path returns no-cache error", async () => {
    const c = makeCtx("/proxy/unknownServer/_cache");
    const res: any = await handler(c);
    expect(res.data.error).toBe("No cache for this MCP server");
    expect(res.data.keys).toEqual([]);
  });
});
