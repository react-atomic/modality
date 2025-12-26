/**
 * SSE (Server-Sent Events) Wrapper Utility
 *
 * Wraps JSON-RPC responses in SSE format as per MCP specification.
 * SSE format:
 *   event: message
 *   id: <unique-id>
 *   data: <json-rpc-response>
 *
 * Supports both single-response and streaming modes.
 * Uses modality-kit for JSON-RPC types and error codes.
 */

import type { JSONRPCResponse, JSONRPCId } from "modality-kit";

interface SSEMessage {
  event: string;
  id: string;
  data: unknown;
}

// ============================================
// SSE HEADERS
// ============================================

/**
 * Standard SSE response headers for MCP
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
} as const;

// ============================================
// CORE SSE FUNCTIONS
// ============================================

/**
 * Generate a unique ID for SSE messages
 */
function generateSSEId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${timestamp}_${random}`;
}

/**
 * Wrap a JSON-RPC response in SSE format
 */
export function wrapSSE(jsonrpcResponse: JSONRPCResponse): SSEMessage {
  return {
    event: "message",
    id: generateSSEId(),
    data: jsonrpcResponse,
  };
}

/**
 * Format SSE message as text for transmission
 */
export function formatSSE(sseMessage: SSEMessage): string {
  return `event: ${sseMessage.event}\nid: ${sseMessage.id}\ndata: ${JSON.stringify(sseMessage.data)}\n\n`;
}

/**
 * Wrap and format JSON-RPC response in one step
 */
export function wrapAndFormatSSE(jsonrpcResponse: JSONRPCResponse): string {
  const sseMessage = wrapSSE(jsonrpcResponse);
  return formatSSE(sseMessage);
}

// ============================================
// CONVENIENCE SSE FORMATTERS
// ============================================

/**
 * Create SSE-formatted success response
 */
export function sseSuccess(id: JSONRPCId, result: unknown = {}): string {
  return wrapAndFormatSSE({
    jsonrpc: "2.0",
    id,
    result,
  });
}

/**
 * Create SSE-formatted error response
 */
export function sseError(
  id: JSONRPCId,
  code: number,
  message: string,
  data?: unknown
): string {
  return wrapAndFormatSSE({
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined && { data }) },
  });
}

/**
 * Create SSE-formatted notification response (id: null, empty result)
 */
export function sseNotification(): string {
  return wrapAndFormatSSE({
    jsonrpc: "2.0",
    id: null,
    result: {},
  });
}

// ============================================
// STREAMING SSE SUPPORT
// ============================================

/**
 * SSE Stream writer for true streaming support
 */
export class SSEStreamWriter {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private closed = false;

  /**
   * Create a ReadableStream for SSE responses
   */
  createStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.closed = true;
        this.controller = null;
      },
    });
  }

  /**
   * Send a JSON-RPC response as SSE message
   */
  send(response: JSONRPCResponse): void {
    if (this.closed || !this.controller) return;
    const formatted = wrapAndFormatSSE(response);
    this.controller.enqueue(this.encoder.encode(formatted));
  }

  /**
   * Send a progress notification
   */
  sendProgress(progressToken: string | number, progress: number, total?: number): void {
    if (this.closed || !this.controller) return;
    const notification: JSONRPCResponse = {
      jsonrpc: "2.0",
      id: null,
      result: {
        method: "notifications/progress",
        params: {
          progressToken,
          progress,
          ...(total !== undefined && { total }),
        },
      },
    };
    const formatted = wrapAndFormatSSE(notification);
    this.controller.enqueue(this.encoder.encode(formatted));
  }

  /**
   * Send a keep-alive ping (SSE comment)
   */
  ping(): void {
    if (this.closed || !this.controller) return;
    this.controller.enqueue(this.encoder.encode(": ping\n\n"));
  }

  /**
   * Send raw SSE event
   */
  sendEvent(event: string, data: unknown, id?: string): void {
    if (this.closed || !this.controller) return;
    const sseId = id || generateSSEId();
    const formatted = `event: ${event}\nid: ${sseId}\ndata: ${JSON.stringify(data)}\n\n`;
    this.controller.enqueue(this.encoder.encode(formatted));
  }

  /**
   * Close the stream
   */
  close(): void {
    if (this.closed || !this.controller) return;
    this.closed = true;
    this.controller.close();
    this.controller = null;
  }

  /**
   * Check if stream is still open
   */
  get isOpen(): boolean {
    return !this.closed && this.controller !== null;
  }
}

/**
 * Create a streaming SSE response
 */
export function createSSEStream(
  handler: (writer: SSEStreamWriter) => Promise<void>,
  headers?: Record<string, string>
): Response {
  const writer = new SSEStreamWriter();
  const stream = writer.createStream();

  // Execute handler asynchronously
  handler(writer)
    .catch((error) => {
      if (writer.isOpen) {
        writer.send({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal error",
          },
        });
      }
    })
    .finally(() => {
      writer.close();
    });

  return new Response(stream, {
    headers: { ...SSE_HEADERS, ...headers },
  });
}
