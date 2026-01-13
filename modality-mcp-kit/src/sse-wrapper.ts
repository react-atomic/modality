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
 * Transfer-Encoding: chunked is required for streaming responses
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Transfer-Encoding": "chunked",
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
 * Uses TransformStream with TextEncoder for HTTP-compatible byte streaming
 */
export class SSEStreamWriter {
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readable: ReadableStream<Uint8Array>;
  private encoder = new TextEncoder();
  private closed = false;

  constructor() {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    this.readable = readable;
    this.writer = writable.getWriter();
  }

  /**
   * Get the readable stream for the Response
   */
  getReadableStream(): ReadableStream<Uint8Array> {
    return this.readable;
  }

  /**
   * Write string data as encoded bytes
   */
  private async write(data: string): Promise<void> {
    if (this.closed || !this.writer) return;
    await this.writer.write(this.encoder.encode(data));
  }

  /**
   * Send a JSON-RPC response as SSE message
   */
  async send(response: JSONRPCResponse): Promise<void> {
    const formatted = wrapAndFormatSSE(response);
    await this.write(formatted);
  }

  /**
   * Send a progress notification
   */
  async sendProgress(progressToken: string | number, progress: number, total?: number): Promise<void> {
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
    await this.write(formatted);
  }

  /**
   * Send a keep-alive ping (SSE comment)
   */
  async ping(): Promise<void> {
    await this.write(": ping\n\n");
  }

  /**
   * Send raw SSE event
   */
  async sendEvent(event: string, data: unknown, id?: string): Promise<void> {
    const sseId = id || generateSSEId();
    const formatted = `event: ${event}\nid: ${sseId}\ndata: ${JSON.stringify(data)}\n\n`;
    await this.write(formatted);
  }

  /**
   * Close the stream
   */
  async close(): Promise<void> {
    if (this.closed || !this.writer) return;
    this.closed = true;
    await this.writer.close();
    this.writer = null;
  }

  /**
   * Check if stream is still open
   */
  get isOpen(): boolean {
    return !this.closed && this.writer !== null;
  }
}

/**
 * Create a streaming SSE response
 *
 * The stream lifecycle is managed as follows:
 * - Handler sends data via writer.send()
 * - Handler MUST call writer.close() when done sending all data
 * - On error, an error response is sent and stream is closed
 * - Client disconnect triggers cancel callback for cleanup
 *
 * IMPORTANT: The handler is responsible for calling writer.close()
 * when it's finished sending data. Not closing will keep the connection open.
 */
export function createSSEStream(
  handler: (writer: SSEStreamWriter) => Promise<void>,
  headers?: Record<string, string>
): Response {
  const writer = new SSEStreamWriter();

  // Execute handler asynchronously
  // Handler is responsible for calling writer.close() when done
  handler(writer).catch(async (error) => {
    if (writer.isOpen) {
      await writer.send({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
      });
      // Close stream on error to signal completion
      await writer.close();
    }
  });

  return new Response(writer.getReadableStream(), {
    headers: { ...SSE_HEADERS, ...headers },
  });
}
