import { describe, it, expect, mock } from "bun:test";
import { FastHonoMcp } from "../FastHonoMcp";

describe("HonoMcpMiddleware", () => {
  it("should extend ModalityFastMCP", () => {
    const middleware = new FastHonoMcp({
      name: "test-mcp",
      version: "0.0.1",
    });
    expect(middleware).toBeDefined();
    expect(typeof middleware.handler).toBe("function");
  });

  it("handler should return a middleware function", () => {
    const middleware = new FastHonoMcp({
      name: "test-mcp",
      version: "0.0.1",
    });
    const handler = middleware.handler();
    expect(typeof handler).toBe("function");
  });

  it("initHono should attach middleware to hono app", () => {
    const middleware = new FastHonoMcp({
      name: "test-mcp",
      version: "0.0.1",
    });

    const mockApp = {
      use: mock(() => mockApp),
    };

    const result = middleware.initHono(mockApp as any, "mcp");

    expect(mockApp.use).toHaveBeenCalledTimes(2);
    expect(result).toBe(middleware);
  });

  it("initHono should use default path 'mcp' when not provided", () => {
    const middleware = new FastHonoMcp({
      name: "test-mcp",
      version: "0.0.1",
    });

    const mockApp = {
      use: mock(() => mockApp),
    };

    middleware.initHono(mockApp as any);

    expect(mockApp.use).toHaveBeenCalledWith("/mcp", expect.any(Function));
    expect(mockApp.use).toHaveBeenCalledWith("/mcp/*", expect.any(Function));
  });

  it("initHono should use custom path when provided", () => {
    const middleware = new FastHonoMcp({
      name: "test-mcp",
      version: "0.0.1",
    });

    const mockApp = {
      use: mock(() => mockApp),
    };

    middleware.initHono(mockApp as any, "/api/mcp");

    expect(mockApp.use).toHaveBeenCalledWith("/api/mcp", expect.any(Function));
    expect(mockApp.use).toHaveBeenCalledWith(
      "/api/mcp/*",
      expect.any(Function)
    );
  });
});
