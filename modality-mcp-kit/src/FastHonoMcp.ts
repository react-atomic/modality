/**
 * MCP Middleware for Hono Integration
 *
 * This middleware integrates the Model Context Protocol (MCP) into a Hono web server.
 * It delegates all MCP protocol handling to FastMCP's built-in capabilities, avoiding
 * any custom protocol implementation.
 *
 * Architecture:
 * - Hono serves as the primary and only HTTP server (port 8800)
 * - FastMCP handles all MCP protocol logic, schema conversion, and responses
 * - Middleware acts as a simple proxy to FastMCP's stateless request handling
 * - No manual JSON-RPC method handling - FastMCP does everything
 *
 * Key Principle:
 * - Always reuse FastMCP's built-in functions
 * - Never implement custom MCP protocol logic
 * - Let FastMCP handle initialize, tools/list, tools/call, etc.
 *
 * Usage:
 *   app.use('/mcp', mcpMiddleware);
 *   app.use('/mcp/*', mcpMiddleware);
 *
 * https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/schema
 * https://modelcontextprotocol.io/specification/2025-11-25/schema
 */

import type { MiddlewareHandler, Hono } from "hono";
import { ModalityFastMCP } from "./util_mcp_tools_converter.js";
import { createMcpConnectionDemoHandler } from "./util_mcp_connection_demo.js";
import {
  JSONRPCManager,
  type JSONRPCResponse,
  getLoggerInstance,
} from "modality-kit";
import {
  sseNotification,
  sseError,
  SSE_HEADERS,
  createSSEStream,
  type SSEStreamWriter,
} from "./sse-wrapper.js";
import { McpSessionManager } from "./McpSessionManager.js";
import { handleToolCall } from "./handlers/tools-call-handler.js";

export interface FastHonoMcpConfig extends Record<string, unknown> {
  name: string;
  version: string;
  mcpPath?: string;
  mcpDemoPath?: string;
  helloWorld?: string;
}

const defaultMcpPath = "/mcp";
const defaultMcpDemoPath = "/";
const mcpSchemaVersion = "2025-11-25";

// Initialize FastMCP instance for internal use (NO SERVER)

export class FastHonoMcp extends ModalityFastMCP {
  public logger!: ReturnType<typeof getLoggerInstance>;
  public config: FastHonoMcpConfig;
  public sessions = new McpSessionManager();
  public mcpPath: string = defaultMcpPath;

  constructor(config: FastHonoMcpConfig) {
    super();
    this.config = config;
  }

  initHono(app: Hono): this {
    const {
      name,
      version,
      helloWorld,
      mcpPath = defaultMcpPath,
      mcpDemoPath = defaultMcpDemoPath,
    } = this.config;
    this.mcpPath = mcpPath;
    const middlewareHandler = this.handler();

    app.use(mcpPath, middlewareHandler);
    app.use(`${mcpPath}/*`, middlewareHandler);
    app.get(
      mcpDemoPath,
      createMcpConnectionDemoHandler({
        serverName: name,
        serverVersion: version,
        mcpPath,
        helloWorld,
        middleware: this,
      })
    );
    return this;
  }

  /**
   * Disconnect and cleanup a session
   */
  disconnect(sessionId: string): boolean {
    const disconnected = this.sessions.disconnect(sessionId);
    if (disconnected) {
      this.logger?.info(`Session disconnected: ${sessionId}`);
    }
    return disconnected;
  }

  /**
   * Ensure session exists, create if needed
   * Returns the session ID to use
   */
  private ensureSession(requestSessionId?: string): string {
    if (requestSessionId && this.sessions.has(requestSessionId)) {
      // Session exists, update activity
      this.sessions.touch(requestSessionId);
      return requestSessionId;
    }
    // Create new session (either no ID provided or ID doesn't exist)
    const session = this.sessions.create();
    this.logger?.info(`Session created: ${session.id}`);
    return session.id;
  }

  /**
   * Get CORS headers for cross-origin requests
   */
  private getCorsHeaders(): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers":
        "content-type,mcp-protocol-version,mcp-session-id",
      "Access-Control-Expose-Headers": "mcp-session-id",
      "Access-Control-Max-Age": "86400",
    };
  }

  handler(): MiddlewareHandler {
    return async (c, next) => {
      this.logger =
        this.logger || getLoggerInstance("HonoMcpMiddleware", "debug");
      const url = new URL(c.req.url);

      // Only handle MCP routes
      if (!url.pathname.startsWith(this.mcpPath)) {
        return next();
      }

      // Set CORS headers once for all responses
      const corsHeaders = this.getCorsHeaders();
      Object.entries(corsHeaders).forEach(([key, value]) => {
        c.header(key, value);
      });

      try {
        // Handle CORS preflight OPTIONS request
        if (c.req.method === "OPTIONS" && url.pathname === this.mcpPath) {
          return c.body(null, 204);
        }

        // Handle DELETE for session disconnect
        if (c.req.method === "DELETE" && url.pathname === this.mcpPath) {
          const requestSessionId = c.req.header("mcp-session-id");

          if (!requestSessionId) {
            return c.json({ error: "Missing mcp-session-id header" }, 400);
          }

          const disconnected = this.disconnect(requestSessionId);
          if (disconnected) {
            return c.body(null, 204);
          }
          return c.json({ error: "Session not found" }, 404);
        }

        // Handle main MCP endpoint
        if (c.req.method === "POST" && url.pathname === this.mcpPath) {
          const requestSessionId = c.req.header("mcp-session-id");
          const sessionId = this.ensureSession(requestSessionId);
          c.header("mcp-session-id", sessionId);

          const bodyText = await c.req.text();
          this.logger.info("MCP Middleware Received Body", { bodyText });

          // Handle notifications/initialized
          try {
            const requestData = JSON.parse(bodyText);
            if (requestData?.method === "notifications/initialized") {
              Object.entries(SSE_HEADERS).forEach(([key, value]) => {
                c.header(key, value);
              });
              return c.text(sseNotification(), 200);
            }
          } catch {
            // Not valid JSON, continue with normal processing
          }

          // Use streaming SSE response
          const responseHeaders = {
            "mcp-session-id": sessionId,
            ...corsHeaders,
          };
          return createSSEStream(async (writer: SSEStreamWriter) => {
            const result =
              await createJsonRpcManager(this).validateMessage(bodyText);
            await writer.send(result as unknown as JSONRPCResponse);
            await writer.close();
          }, responseHeaders);
        }

        return c.json(
          { error: `Use ${this.mcpPath} for MCP requests` },
          400
        );
      } catch (error) {
        this.logger.error(
          `FastHonoMcp (${url.pathname}) Middleware Error`,
          error as Error
        );
        const message =
          error instanceof Error ? error.message : "Internal error";
        Object.entries(SSE_HEADERS).forEach(([key, value]) => {
          c.header(key, value);
        });
        return c.text(sseError(null, -32603, message), 500);
      }
    };
  }
}

class HonoJSONRPCManager extends JSONRPCManager<any> {
  protected async sendMessage(message: any) {
    return message;
  }
}

function createJsonRpcManager(middleware: FastHonoMcp): HonoJSONRPCManager {
  const mcpTools = middleware.getTools();
  const mcpPrompts = middleware.getPrompts();
  const jsonrpc = new HonoJSONRPCManager();
  jsonrpc.registerMethod("initialize", {
    handler(params: any) {
      // Validate required request parameters
      if (!params.capabilities) {
        throw new Error("Missing required parameter: capabilities");
      }
      if (!params.clientInfo) {
        throw new Error("Missing required parameter: clientInfo");
      }
      if (!params.protocolVersion) {
        throw new Error("Missing required parameter: protocolVersion");
      }

      // Return valid InitializeResult
      return {
        protocolVersion: mcpSchemaVersion,
        capabilities: {
          tools: { listChanged: true },
          ...(mcpPrompts.length > 0 && { prompts: { listChanged: true } }),
          completions: {},
          logging: {},
        },
        serverInfo: {
          name: middleware.config.name,
          version: middleware.config.version,
        },
      };
    },
  });

  jsonrpc.registerMethod("tools/list", {
    async handler() {
      const { toJsonSchema } = await import("xsschema");
      const tools = await Promise.all(
        mcpTools.map(async (tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: await toJsonSchema(tool.parameters), // Simplified for example
        }))
      );
      return {
        tools,
      };
    },
  });

  jsonrpc.registerMethod("tools/call", {
    async handler(params) {
      return handleToolCall(params as any, mcpTools);
    },
  });

  jsonrpc.registerMethod("prompts/list", {
    async handler() {
      const prompts = mcpPrompts.map((prompt) => ({
        name: prompt.name,
        ...(prompt.description && { description: prompt.description }),
        ...(prompt.arguments && {
          arguments: prompt.arguments.map((arg: any) => ({
            name: arg.name,
            ...(arg.description && { description: arg.description }),
            ...(arg.required !== undefined && { required: arg.required }),
            ...(arg.enum && { enum: Array.from(arg.enum) }),
          })),
        }),
      }));
      return { prompts };
    },
  });

  jsonrpc.registerMethod("prompts/get", {
    async handler(params: any) {
      const { ERROR_METHOD_NOT_FOUND } = await import("modality-kit");
      const { name, arguments: args } = params as any;
      const prompt = mcpPrompts.find((p) => p.name === name);
      if (!prompt) {
        throw new ERROR_METHOD_NOT_FOUND(`Prompt not found: ${name}`);
      }
      const text = await prompt.load(args || {});
      return {
        ...(prompt.description && { description: prompt.description }),
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text,
            },
          },
        ],
      };
    },
  });

  jsonrpc.registerMethod("completion/complete", {
    async handler(params: any) {
      const { ref, argument } = params;

      // Only handle prompt references
      if (ref?.type !== "ref/prompt") {
        return { completion: { values: [], total: 0 } };
      }

      const prompt = mcpPrompts.find((p) => p.name === ref.name);
      if (!prompt || !prompt.arguments) {
        return { completion: { values: [], total: 0 } };
      }

      const arg = prompt.arguments.find((a: any) => a.name === argument.name);
      if (!arg || !arg.enum) {
        return { completion: { values: [], total: 0 } };
      }

      const enumValues: string[] = Array.from(arg.enum);
      const inputValue = (argument.value || "").trim().toLowerCase();
      const completionLimit = prompt.completionLimit ?? 10;

      // Empty input: return first N items
      if (!inputValue) {
        const limit = Math.min(completionLimit, enumValues.length);
        return {
          completion: {
            values: enumValues.slice(0, limit),
            total: enumValues.length,
            hasMore: enumValues.length > limit,
          },
        };
      }

      // Filter enum values by the partial input
      const matchingValues = enumValues.filter((v) =>
        v.toLowerCase().startsWith(inputValue)
      );

      return {
        completion: {
          values: matchingValues.slice(0, 100),
          total: matchingValues.length,
          hasMore: matchingValues.length > 100,
        },
      };
    },
  });

  // Notification - no response needed (return empty result)
  jsonrpc.registerMethod("notifications/initialized", {
    handler() {
      return {};
    },
  });

  // notifications/cancelled - client requests cancellation of in-flight request
  jsonrpc.registerMethod("notifications/cancelled", {
    handler(params: any) {
      const { requestId, reason } = params;
      middleware.logger.info(`Request cancelled: ${requestId}`, { reason });
      // Note: Stateless HTTP cannot cancel in-flight requests
      // This handler acknowledges the notification for spec compliance
      return {};
    },
  });

  // ping - keep-alive check per MCP spec
  jsonrpc.registerMethod("ping", {
    handler() {
      return {};
    },
  });

  // logging/setLevel - validate and return empty result per MCP spec
  jsonrpc.registerMethod("logging/setLevel", {
    handler(params: any) {
      const VALID_LOG_LEVELS = [
        "debug",
        "info",
        "notice",
        "warning",
        "error",
        "critical",
        "alert",
        "emergency",
      ] as const;

      // Map MCP log levels to modality logger levels
      const LOG_LEVEL_MAP: Record<
        (typeof VALID_LOG_LEVELS)[number],
        "debug" | "info" | "warn" | "error"
      > = {
        debug: "debug",
        info: "info",
        notice: "info",
        warning: "warn",
        error: "error",
        critical: "error",
        alert: "error",
        emergency: "error",
      };

      const { level } = params;

      // Validate level parameter exists
      if (!level) {
        throw new Error("Missing required parameter: level");
      }

      // Validate level is a valid LoggingLevel
      if (!VALID_LOG_LEVELS.includes(level)) {
        throw new Error(
          `Invalid log level: ${level}. Must be one of: ${VALID_LOG_LEVELS.join(", ")}`
        );
      }

      // Map and apply log level to modality logger
      const modalityLogLevel =
        LOG_LEVEL_MAP[level as (typeof VALID_LOG_LEVELS)[number]];
      middleware.logger.setLogLevel(modalityLogLevel);
      middleware.logger.info(`Log level set to: ${level}`);

      // Return empty result per MCP spec
      return {};
    },
  });
  return jsonrpc;
}
