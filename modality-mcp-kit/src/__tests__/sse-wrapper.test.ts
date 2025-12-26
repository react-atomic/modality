import { describe, it, expect } from "bun:test";
import { JSONRPC_VERSION } from "modality-kit";
import {
  wrapSSE,
  formatSSE,
  wrapAndFormatSSE,
  sseSuccess,
  sseError,
  sseNotification,
  SSE_HEADERS,
} from "../sse-wrapper";

describe("sse-wrapper", () => {
  it("SSE_HEADERS should have Content-Type text/event-stream", () => {
    expect(SSE_HEADERS["Content-Type"]).toBe("text/event-stream");
  });

  it("wrapSSE should wrap response with event, id, data", () => {
    const response = { jsonrpc: JSONRPC_VERSION, id: 1, result: {} };
    const wrapped = wrapSSE(response);
    expect(wrapped.event).toBe("message");
    expect(typeof wrapped.id).toBe("string");
    expect(wrapped.data).toEqual(response);
  });

  it("formatSSE should output SSE format with event, id, data", () => {
    const formatted = formatSSE({
      event: "message",
      id: "test",
      data: { test: true },
    });
    expect(formatted).toContain("event: message");
    expect(formatted).toContain("id: test");
    expect(formatted).toContain("data:");
  });

  it("wrapAndFormatSSE should combine wrap and format", () => {
    const formatted = wrapAndFormatSSE({
      jsonrpc: "2.0",
      id: 1,
      result: {},
    });
    expect(formatted).toContain("event: message");
    expect(formatted).toContain("jsonrpc");
  });

  it("sseSuccess should create valid JSON-RPC success response", () => {
    const response = sseSuccess(1, { data: "test" });
    expect(response).toContain("jsonrpc");
    expect(response).toContain("result");
  });

  it("sseError should create valid JSON-RPC error response", () => {
    const response = sseError(1, -32600, "Invalid Request");
    expect(response).toContain("error");
    expect(response).toContain("-32600");
  });

  it("sseNotification should create response with null ID", () => {
    const response = sseNotification();
    expect(response).toContain("null");
    expect(response).toContain("result");
  });
});
