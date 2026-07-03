import { describe, it, expect } from "bun:test";
import type { Context } from "hono";
import {
  mcpConnectionDemoHandler,
  createMcpConnectionDemoHandler,
} from "../util_mcp_connection_demo";
import type { FastMCPCompatible } from "../util_mcp_tools_converter";

type DemoConfig = Parameters<typeof createMcpConnectionDemoHandler>[0];

type StubContext = Context & { jsonCalls: unknown[] };

const makeContext = (format?: string): StubContext => {
  const jsonCalls: unknown[] = [];
  const stub = {
    jsonCalls,
    req: { query: (key: string) => (key === "format" ? format : undefined) },
    json: (data: unknown, init?: ResponseInit) => {
      jsonCalls.push(data);
      return new Response(JSON.stringify(data), init);
    },
  };
  return stub as unknown as StubContext;
};

const middlewareWith = (
  tools: { name: string; description?: string }[]
): FastMCPCompatible =>
  ({ getTools: () => tools }) as unknown as FastMCPCompatible;

const getHtml = async (config?: DemoConfig): Promise<string> => {
  const res = await mcpConnectionDemoHandler(makeContext("html"), config);
  return (res as Response).text();
};

describe("mcpConnectionDemoHandler html format", () => {
  it("returns text/html response starting with doctype", async () => {
    const res = (await mcpConnectionDemoHandler(makeContext("html"))) as Response;
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toStartWith("<!DOCTYPE html>");
  });

  it("uses serverName as page title", async () => {
    const html = await getHtml({ serverName: "my-server" });
    expect(html).toContain("<title>my-server</title>");
  });

  it("renders one client card per showcase client", async () => {
    const html = await getHtml({ serverName: "my-server" });
    expect(html.match(/<div class="mcp-client-card">/g)?.length).toBe(4);
  });

  it("escapes html in tool descriptions", async () => {
    const html = await getHtml({
      serverName: "s",
      middleware: middlewareWith([
        { name: "t", description: '<script>alert("x")</script>' },
      ]),
    });
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders markdown in tool descriptions", async () => {
    const html = await getHtml({
      serverName: "s",
      middleware: middlewareWith([
        { name: "t", description: "**bold** [doc](https://x.dev)" },
      ]),
    });
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain(
      '<a href="https://x.dev" target="_blank" rel="noopener noreferrer">doc</a>'
    );
  });

  it("shows hello prompt section when helloWorld is set", async () => {
    const html = await getHtml({ serverName: "s", helloWorld: "hi there" });
    expect(html).toContain("Hello Prompt");
    expect(html).toContain("hi there");
    expect(html).not.toContain("Welcome to MCP");
  });

  it("shows welcome section when helloWorld is not set", async () => {
    const html = await getHtml({ serverName: "s" });
    expect(html).toContain("Welcome to MCP");
  });

  it("renders custom groups with their items", async () => {
    const html = await getHtml({
      serverName: "s",
      customGroups: [
        { groupName: "Extras", groupItems: [{ name: "item-a", description: "d" }] },
      ],
    });
    expect(html).toContain("Extras");
    expect(html).toContain("item-a");
  });

  it("omits server tools section when middleware has no tools", async () => {
    const html = await getHtml({ serverName: "s" });
    expect(html).not.toContain("Server Tools");
  });

  it("escapes quotes from serverName inside the copy onclick attribute", async () => {
    const html = await getHtml({ serverName: 'x" onmouseover="alert(1)' });
    expect(html).not.toContain('onmouseover="alert(1)"');
  });

  it("uses configured mcpPath in connection codes and url display", async () => {
    const html = await getHtml({
      serverName: "s",
      serverUrl: "https://api.example.com",
      mcpPath: "/custom-mcp",
    });
    expect(html).toContain("{serverUrl}/custom-mcp");
    expect(html).toContain("https://api.example.com/custom-mcp");
  });
});

describe("mcpConnectionDemoHandler markdown format", () => {
  it("returns text/markdown documentation", async () => {
    const res = (await mcpConnectionDemoHandler(makeContext("markdown"), {
      serverName: "md-server",
    })) as Response;
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("# MCP Connection Guide");
    expect(body).toContain("md-server");
  });
});

describe("mcpConnectionDemoHandler json format", () => {
  it("returns complete demo data via c.json", async () => {
    const ctx = makeContext("json");
    await mcpConnectionDemoHandler(ctx, {
      serverName: "json-server",
      serverVersion: "1.2.3",
    });
    const data = ctx.jsonCalls[0] as {
      server: Record<string, unknown>;
      mcpClients: unknown[];
      metadata: { availableFormats: string[] };
    };
    expect(data.server).toEqual({
      name: "json-server",
      version: "1.2.3",
      url: "",
      mcpPath: "/mcp",
    });
    expect(data.mcpClients.length).toBe(4);
    expect(data.metadata.availableFormats).toEqual(["json", "markdown", "html"]);
  });
});

describe("createMcpConnectionDemoHandler", () => {
  it("binds config and defaults to html output", async () => {
    const handler = createMcpConnectionDemoHandler({ serverName: "bound-server" });
    const res = (await handler(makeContext())) as Response;
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toContain("bound-server");
  });
});
