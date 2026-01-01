// Import MCP types for transport wrapper
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getLoggerInstance } from "modality-kit";

const logger = getLoggerInstance("stream-mcp");

/**
 * Custom transport wrapper that captures FastMCP streaming content
 * This intercepts HTTP streaming data sent via streamContent() calls using SSE
 */
export class StreamingMCPTransportWrapper implements Transport {
  private transport: StreamableHTTPClientTransport;
  private onStreamingContent?: (content: string) => void;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(url: string, onStreamingContent?: (content: string) => void) {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    this.transport = transport;
    // Forward transport events
    this.transport.onclose = () => this.onclose?.();
    this.transport.onerror = (error: Error) => this.onerror?.(error);
    this.transport.onmessage = (message: JSONRPCMessage) => {
      // Still intercept final messages for debugging
      this.interceptStreamingMessage(message);
      this.onmessage?.(message);
    };

    this.onStreamingContent = onStreamingContent;
  }

  private interceptStreamingMessage(message: JSONRPCMessage): void {
    // Look for FastMCP streaming content notifications
    if (message && typeof message === "object") {
      // Check for FastMCP streaming content notification
      if (
        "method" in message &&
        message.method === "notifications/tool/streamContent"
      ) {
        const params = (message as any).params;
        if (params && params.content && Array.isArray(params.content)) {
          for (const contentBlock of params.content) {
            if (contentBlock.type === "text" && contentBlock.text) {
              console.log(
                `📢 Captured streaming content: "${contentBlock.text}"`
              );
              this.onStreamingContent?.(contentBlock.text);
            }
          }
        }
      }

      // Also capture final result for debugging
      if (
        "result" in message &&
        message.result &&
        typeof message.result === "object"
      ) {
        const result = message.result as any;
        if (result.content && Array.isArray(result.content)) {
          for (const contentBlock of result.content) {
            if (contentBlock.type === "text" && contentBlock.text) {
              console.log(`📢 Final result content: "${contentBlock.text}"`);
            }
          }
        }
      }
    }
  }

  async start(): Promise<void> {
    return this.transport.start();
  }

  async close(): Promise<void> {
    return this.transport.close();
  }

  async send(message: JSONRPCMessage | JSONRPCMessage[]): Promise<void> {
    // Intercept the send operation to monitor HTTP responses for SSE
    logger.info(
      "🔍 Intercepting send operation to monitor for SSE streaming..."
    );
    return this.transport.send(message);
  }

  get sessionId(): string | undefined {
    return this.transport.sessionId;
  }
}
