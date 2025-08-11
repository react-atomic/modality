/**
 * JSON-RPC Manager
 *
 * Clean JSON-RPC 2.0 implementation for WebSocket communication.
 * Provides method registration, routing, and lifecycle management.
 */

import { getLoggerInstance } from "./util_logger";
import { JSONRPCCall } from "./util_pending";

import {
  JSONRPCErrorCode,
  JSONRPCUtils,
  STANDARD_ERROR_MESSAGES,
} from "./schemas/jsonrpc";
import type {
  JSONRPCValidationResult,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  JSONRPCMessage,
  JSONRPCError,
  JSONRPCParams,
} from "./schemas/jsonrpc";

/**
 * Method handler function signature
 */
type JSONRPCMethodHandler<TContext, T = JSONRPCParams> = (
  params?: T,
  context?: TContext
) => Promise<any> | any;

/**
 * Method registration configuration
 */
interface JSONRPCMethodConfig<TContext, T = JSONRPCParams> {
  /** Method handler function */
  handler: JSONRPCMethodHandler<TContext, T>;
  /** Optional parameter validation schema */
  paramSchema?: any;
  /** Optional method description */
  description?: string;
  /** Whether this method requires authentication */
  requiresAuth?: boolean;
  /** Rate limiting configuration */
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
}

/**
 * JSON-RPC Manager configuration
 */
export interface JSONRPCManagerConfig<TContext> {
  /** Enable strict JSON-RPC 2.0 validation */
  strictValidation?: boolean;
  /** Default timeout for requests */
  defaultTimeout?: number;
  /** Maximum batch size for batch requests */
  maxBatchSize?: number;
  /** Custom error handler */
  errorHandler?: (error: Error, context?: TContext) => JSONRPCError;
}

/**
 * JSON-RPC Manager Event Handlers
 */
export interface JSONRPCManagerEvents<TContext> {
  onMethodCall?: (method: string, params: any, context: TContext) => void;
  onMethodResponse?: (method: string, result: any, context: TContext) => void;
  onMethodError?: (
    method: string,
    error: JSONRPCError,
    context: TContext
  ) => void;
}

const logger = getLoggerInstance("JSON-RPC-Manager");

/**
 * Central JSON-RPC Manager class
 */
export class JSONRPCManager<TContext> extends JSONRPCCall {
  private methods = new Map<string, JSONRPCMethodConfig<TContext, any>>();
  private config: Required<JSONRPCManagerConfig<TContext>>;
  private eventHandlers: JSONRPCManagerEvents<TContext>;

  constructor(
    config: JSONRPCManagerConfig<TContext> = {},
    eventHandlers: JSONRPCManagerEvents<TContext> = {}
  ) {
    super();
    this.config = {
      strictValidation: true,
      defaultTimeout: 30000,
      maxBatchSize: 10,
      errorHandler: this.defaultErrorHandler.bind(this),
      ...config,
    };

    this.eventHandlers = eventHandlers;
  }

  /**
   * Register a JSON-RPC method
   */
  registerMethod<T = JSONRPCParams>(
    methodName: string,
    config: JSONRPCMethodConfig<TContext, T>
  ): void {
    if (this.methods.has(methodName)) {
      throw new Error(`Method '${methodName}' is already registered`);
    }

    this.methods.set(methodName, config);
    console.log(`Registered JSON-RPC method: ${methodName}`);
  }

  /**
   * Unregister a JSON-RPC method
   */
  unregisterMethod(methodName: string): boolean {
    const removed = this.methods.delete(methodName);
    if (removed) {
      console.log(`Unregistered JSON-RPC method: ${methodName}`);
    }
    return removed;
  }

  /**
   * Get registered method names
   */
  getRegisteredMethods(): string[] {
    return Array.from(this.methods.keys());
  }

  /**
   * Send a JSON-RPC request and return a promise for the response
   */
  handleRequest(
    method: string,
    params?: any,
    options: any = {}
  ): { promise: Promise<any>; request: JSONRPCRequest } {
    const { promise, request } = super.handleRequest(method, params, options);

    // Send the request (this should be handled by the WebSocket layer)
    this.sendMessage(request, options);

    return { promise, request };
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  sendNotification(method: string, params: any, options: TContext): void {
    const notification = JSONRPCUtils.createNotification(method, params);
    this.sendMessage(notification, options);
  }
  /**
   * Send a message (to be overridden by WebSocket implementation)
   */
  protected sendMessage(message: JSONRPCMessage, options: TContext): void {
    // This method should be overridden by the WebSocket server integration
    console.warn(
      "JSONRPCManager.sendMessage not implemented - message not sent:",
      message,
      options
    );
  }

  /**
   * Process incoming WebSocket message
   */
  async validateMessage(
    data: string | Buffer,
    options: any = {}
  ): Promise<void> {
    try {
      // Parse message
      const messageStr = typeof data === "string" ? data : data.toString();
      const message = JSONRPCUtils.deserialize(messageStr);

      if (!message) {
        console.error("Failed to parse JSON-RPC message:", messageStr);
        const errorResponse = JSONRPCUtils.createErrorResponse(
          JSONRPCUtils.createError(JSONRPCErrorCode.PARSE_ERROR, "Parse error"),
          null
        );
        this.sendMessage(errorResponse, options);
        return;
      }

      // Process the message
      const validation = JSONRPCUtils.validateMessage(message);
      if (!validation.valid) {
        const errorResponse = JSONRPCUtils.createErrorResponse(
          validation.error!,
          (message as any).id || null
        );
        this.sendMessage(errorResponse, options);
        return;
      }
      const response = await this.processMessage(validation, options);

      // Send response if one was generated (requests only, not notifications)
      if (response && (!Array.isArray(response) || response.length > 0)) {
        this.sendMessage(response, options);
      }
    } catch (err) {
      const error = err as Error;
      console.error("Error handling WebSocket message:", error);
      const errorResponse = JSONRPCUtils.createErrorResponse(
        JSONRPCUtils.createError(
          JSONRPCErrorCode.INTERNAL_ERROR,
          "Internal error"
        ),
        null
      );
      this.sendMessage(errorResponse, options);
    }
  }
  /**
   * Process incoming JSON-RPC message (supports batch requests)
   */
  private async processMessage(
    validation: JSONRPCValidationResult,
    options: any = {}
  ): Promise<JSONRPCResponse | JSONRPCResponse[] | void> {
    try {
      // Validate JSON-RPC message

      switch (validation.messageType) {
        case "request":
          return await this.processRequest(
            validation.message as JSONRPCRequest,
            options
          );

        case "notification":
          this.processNotification(
            validation.message as JSONRPCNotification,
            options
          );
          return; // Notifications don't return responses

        case "response":
          const response = validation.message as JSONRPCResponse;
          logger.info("Received response message, handling internally", [
            response,
            response.id,
          ]);
          this.handleResponse(response);
          return; // Responses are handled internally

        case "batch":
          return await this.processBatchRequest(
            validation.message as (JSONRPCRequest | JSONRPCNotification)[],
            options
          );

        default:
          return JSONRPCUtils.createErrorResponse(
            JSONRPCUtils.createError(
              JSONRPCErrorCode.INVALID_REQUEST,
              "Unknown message type"
            ),
            (validation.message as any).id || null
          );
      }
    } catch (error) {
      console.error("Error processing JSON-RPC message:", error);
      return JSONRPCUtils.createErrorResponse(
        this.config.errorHandler(error as Error),
        (validation.message as any).id || null
      );
    }
  }

  /**
   * Process a JSON-RPC request
   */
  private async processRequest(
    request: JSONRPCRequest,
    options: any = {}
  ): Promise<JSONRPCResponse> {
    const context: TContext = {
      ...options,
      request,
      metadata: {},
    };

    try {
      // Check if method is registered
      const methodConfig = this.methods.get(request.method);
      if (!methodConfig) {
        const error = JSONRPCUtils.createError(
          JSONRPCErrorCode.METHOD_NOT_FOUND,
          `Method '${request.method}' not found`
        );

        if (this.eventHandlers.onMethodError) {
          this.eventHandlers.onMethodError(request.method, error, context);
        }

        return JSONRPCUtils.createErrorResponse(error, request.id);
      }

      // Call event handler
      if (this.eventHandlers.onMethodCall) {
        this.eventHandlers.onMethodCall(
          request.method,
          request.params,
          context
        );
      }

      // Execute method handler
      const result = await methodConfig.handler(request.params, context);

      // Call success event handler
      if (this.eventHandlers.onMethodResponse) {
        this.eventHandlers.onMethodResponse(request.method, result, context);
      }

      return JSONRPCUtils.createSuccessResponse(result, request.id);
    } catch (error) {
      console.error(`Error executing method '${request.method}':`, error);

      const jsonrpcError = this.config.errorHandler(error as Error, context);

      if (this.eventHandlers.onMethodError) {
        this.eventHandlers.onMethodError(request.method, jsonrpcError, context);
      }

      return JSONRPCUtils.createErrorResponse(jsonrpcError, request.id);
    }
  }

  /**
   * Process a JSON-RPC notification
   */
  private async processNotification(
    notification: JSONRPCNotification,
    options: any = {}
  ): Promise<void> {
    const context: TContext = {
      ...options,
      request: notification,
      metadata: {},
    };

    try {
      const methodConfig = this.methods.get(notification.method);
      if (!methodConfig) {
        console.warn(`Notification method '${notification.method}' not found`);
        return;
      }

      if (this.eventHandlers.onMethodCall) {
        this.eventHandlers.onMethodCall(
          notification.method,
          notification.params,
          context
        );
      }

      await methodConfig.handler(notification.params, context);
    } catch (error) {
      console.error(
        `Error executing notification '${notification.method}':`,
        error
      );
    }
  }

  /**
   * Process a JSON-RPC batch request
   */
  private async processBatchRequest(
    batchRequest: (JSONRPCRequest | JSONRPCNotification)[],
    options: any = {}
  ): Promise<JSONRPCResponse[]> {
    // Check batch size limit
    if (batchRequest.length > this.config.maxBatchSize) {
      const error = JSONRPCUtils.createError(
        JSONRPCErrorCode.INVALID_REQUEST,
        `Batch size ${batchRequest.length} exceeds maximum allowed size ${this.config.maxBatchSize}`
      );
      return [JSONRPCUtils.createErrorResponse(error, null)];
    }

    const promises = batchRequest.map((item) => {
      if (JSONRPCUtils.isRequest(item)) {
        return this.processRequest(item, options);
      } else if (JSONRPCUtils.isNotification(item)) {
        return this.processNotification(item, options);
      }
      // This case should ideally not be reached if validation is done properly upstream
      return Promise.resolve();
    });

    const results = await Promise.all(promises);

    // Filter out void results from notifications or other cases
    return results.filter((result): result is JSONRPCResponse => !!result);
  }

  /**
   * Default error handler
   */
  private defaultErrorHandler(error: Error): JSONRPCError {
    if (error.message.includes("timeout")) {
      return JSONRPCUtils.createError(
        JSONRPCErrorCode.TIMEOUT_ERROR,
        STANDARD_ERROR_MESSAGES[JSONRPCErrorCode.TIMEOUT_ERROR]
      );
    }

    if (error.message.includes("connection")) {
      return JSONRPCUtils.createError(
        JSONRPCErrorCode.CONNECTION_ERROR,
        STANDARD_ERROR_MESSAGES[JSONRPCErrorCode.CONNECTION_ERROR]
      );
    }

    return JSONRPCUtils.createError(
      JSONRPCErrorCode.INTERNAL_ERROR,
      STANDARD_ERROR_MESSAGES[JSONRPCErrorCode.INTERNAL_ERROR],
      { originalError: error.message }
    );
  }

  /**
   * Get manager statistics
   */
  getStats() {
    const parentStats = super.getStats();
    return {
      ...parentStats,
      registeredMethods: this.methods.size,
      methodNames: this.getRegisteredMethods(),
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    super.destroy();
    this.methods.clear();
  }
}
