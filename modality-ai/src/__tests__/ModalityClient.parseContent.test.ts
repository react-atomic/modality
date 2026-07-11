import { test, expect, describe } from "bun:test";
import { ModalityClient } from "../ModalityClient";

// parseContent is pure — the client never connects in these tests.
const client = ModalityClient.http("http://127.0.0.1:1");

const text = (v: unknown) => ({
  type: "text",
  text: typeof v === "string" ? v : JSON.stringify(v),
});

describe("parseContent", () => {
  test("single JSON object block parses and derives success from isError", () => {
    const result = client.parseContent({
      isError: false,
      content: [text({ message: "ok" })],
    });
    expect(result).toEqual({ message: "ok", success: true });
  });

  test("error results carry success: false", () => {
    const result = client.parseContent({
      isError: true,
      content: [text({ error: "boom", operation: "CodeSymbol_Current" })],
    });
    expect(result).toEqual({
      error: "boom",
      operation: "CodeSymbol_Current",
      success: false,
    });
  });

  test("a tool's explicit success field is never overridden", () => {
    const result = client.parseContent({
      isError: false,
      content: [text({ success: false, message: "partial" })],
    }) as Record<string, unknown>;
    expect(result.success).toBe(false);
  });

  test("multi-block modality-kit results merge envelope + payload", () => {
    const result = client.parseContent({
      isError: false,
      content: [
        text({ message: "Current symbols retrieved successfully" }),
        text({ symbolAtCursor: { path: "/x.ts" }, fileSymbols: [{ name: "a" }] }),
      ],
    });
    expect(result).toEqual({
      message: "Current symbols retrieved successfully",
      symbolAtCursor: { path: "/x.ts" },
      fileSymbols: [{ name: "a" }],
      success: true,
    });
  });

  test("later blocks win on key collisions", () => {
    const result = client.parseContent({
      content: [text({ message: "envelope" }), text({ message: "payload" })],
    }) as Record<string, unknown>;
    expect(result.message).toBe("payload");
  });

  test("non-JSON blocks (DEBUG response-size note) land under _extra", () => {
    const result = client.parseContent({
      isError: false,
      content: [text({ message: "ok" }), text("Response size: 123 bytes")],
    });
    expect(result).toEqual({
      message: "ok",
      _extra: "Response size: 123 bytes",
      success: true,
    });
  });

  test("multiple extras become an _extra array", () => {
    const result = client.parseContent({
      isError: false,
      content: [
        text({ message: "main" }),
        text("note 1"),
        text("note 2"),
      ],
    });
    expect(result).toEqual({
      message: "main",
      _extra: ["note 1", "note 2"],
      success: true,
    });
  });

  test("multiple plain-text blocks without objects return an array", () => {
    const result = client.parseContent({
      content: [text("a"), text("b"), text("c")],
    });
    expect(result).toEqual(["a", "b", "c"]);
  });

  test("non-text blocks interleaved with object blocks are ignored", () => {
    const result = client.parseContent({
      isError: false,
      content: [
        { type: "image", data: "skipped" },
        text({ message: "ok" }),
      ],
    });
    expect(result).toEqual({ message: "ok", success: true });
  });

  test("plain string result passes through untouched (legacy)", () => {
    expect(client.parseContent({ content: [text("just text")] })).toBe("just text");
  });

  test("a lone JSON array passes through untouched (legacy)", () => {
    expect(client.parseContent({ content: [text([1, 2, 3])] })).toEqual([1, 2, 3]);
  });

  test("non-text first block returns the block itself (legacy)", () => {
    const image = { type: "image", data: "…" };
    expect(client.parseContent({ content: [image] })).toEqual(image);
  });

  test("empty / missing content returns the raw result (legacy)", () => {
    expect(client.parseContent({ content: [] })).toEqual({ content: [] });
    expect(client.parseContent(undefined)).toBeUndefined();
  });

  test("isError absent defaults to success true", () => {
    const result = client.parseContent({
      content: [text({ message: "ok" })],
    }) as Record<string, unknown>;
    expect(result.success).toBe(true);
  });

  test("null toolResult passes through", () => {
    expect(client.parseContent(null)).toBeNull();
  });

  test("non-array content falls through to legacy passthrough", () => {
    const content = { type: "text", text: "non-array" };
    const result = client.parseContent({ content }) as Record<string, unknown>;
    expect(result.content).toEqual(content);
  });

  test("_extra in payload avoids collision with parser extras", () => {
    const result = client.parseContent({
      isError: false,
      content: [
        text({ _extra: "original", message: "pay me" }),
        text("debug note"),
      ],
    }) as Record<string, unknown>;
    expect(result.message).toBe("pay me");
    expect(result._extra).toBe("original");
    expect(result.__extra).toBe("debug note");
    expect(result.success).toBe(true);
  });
});
