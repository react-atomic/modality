/**
 * JSON-RPC Manager
 *
 * Clean JSON-RPC 2.0 implementation for communication.
 * Provides method registration, routing, and lifecycle management.
 */
import { ErrorCode } from "./ErrorCode";
import { getLoggerInstance } from "./util_logger";
import { JSONRPCCall } from "./util_pending";

import { JSONRPCUtils } from "./JSONRPCUtils";
import { JSONRPCErrorCode, STANDARD_ERROR_MESSAGES } from "./schemas/jsonrpc";
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
  params: T,
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

export class ERROR_METHOD_NOT_FOUND extends ErrorCode {
  readonly code = JSONRPCErrorCode.METHOD_NOT_FOUND;
}
class ERROR_PARSE_ERROR extends ErrorCode {
  readonly code = JSONRPCErrorCode.PARSE_ERROR;
}

/**
 * Central JSON-RPC Manager class
 */
export abstract class JSONRPCManager<TContext> extends JSONRPCCall {
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
          return await this.processMethod(
            validation.message as JSONRPCRequest,
            options
          );

        case "notification":
          this.processNotification(
            validation.message as JSONRPCNotification,
            options
          );
          break;

        case "response":
          const response = validation.message as JSONRPCResponse;
          logger.info("Received response message, handling internally", [
            response,
            response.id,
          ]);
          this.handleResponse(response);
          break;

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
      logger.error("Error processing JSON-RPC message:", error);
      return JSONRPCUtils.createErrorResponse(
        this.config.errorHandler(error as Error),
        (validation.message as any).id || null
      );
    }
  }

  /**
   * Process a JSON-RPC request
   */
  private async processMethod(
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
        throw new ERROR_METHOD_NOT_FOUND(
          `Method '${request.method}' not found`
        );
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
      logger.error(`Error executing method '${request.method}':`, error);

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
        throw new ERROR_METHOD_NOT_FOUND(
          `Notification method '${notification.method}' not handled.`
        );
      }

      if (this.eventHandlers.onMethodCall) {
        this.eventHandlers.onMethodCall(
          notification.method,
          notification.params,
          context
        );
      }

      return await methodConfig.handler(notification.params, context);
    } catch (error) {
      logger.info(
        `Notification get exception: '${notification.method}':`,
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
        return this.processMethod(item, options);
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

    const code: JSONRPCErrorCode =
      (error as any)?.code || JSONRPCErrorCode.INTERNAL_ERROR;

    const errorType = STANDARD_ERROR_MESSAGES[code];

    return JSONRPCUtils.createError(code, error.message || errorType, {
      errorType,
    });
  }

  /**
   * Send a message (to be overridden by implementation)
   */
  protected abstract sendMessage(
    message: JSONRPCMessage,
    options?: TContext
  ): any;

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  protected sendNotification(
    method: string,
    params: any,
    options: TContext
  ): void {
    const notification = JSONRPCUtils.createNotification(method, params);
    return this.sendMessage(notification, options);
  }

  /**
   * Register a JSON-RPC method
   */
  public registerMethod<T = JSONRPCParams>(
    methodName: string,
    config: JSONRPCMethodConfig<TContext, T>
  ): void {
    if (this.methods.has(methodName)) {
      throw new Error(`Method '${methodName}' is already registered`);
    }

    this.methods.set(methodName, config);
  }

  /**
   * Unregister a JSON-RPC method
   */
  public unregisterMethod(methodName: string): boolean {
    const removed = this.methods.delete(methodName);
    if (removed) {
      logger.info(`Unregistered JSON-RPC method: ${methodName}`);
    }
    return removed;
  }

  /**
   * Get registered method names
   */
  public getRegisteredMethods(): string[] {
    return Array.from(this.methods.keys());
  }

  /**
   * Send a JSON-RPC request and return a promise for the response
   */
  public handleRequest(
    method: string,
    params?: any,
    options: any = {}
  ): { promise: Promise<any>; request: JSONRPCRequest; result: any } {
    const { promise, request } = super.handleRequest(method, params, options);

    const result = this.sendMessage(request, options);
    return { promise, request, result };
  }

  /**
   * Process incoming WebSocket message
   */
  public async validateMessage(
    data: string | Buffer | Record<string, any>,
    options: any = {}
  ): Promise<void> {
    try {
      // Parse message
      const message = JSONRPCUtils.deserialize(data);

      if (!message) {
        throw new ERROR_PARSE_ERROR("Failed to parse JSON-RPC message");
      }

      // Process the message
      const validation = JSONRPCUtils.validateMessage(message);
      if (!validation.valid) {
        const errorResponse = JSONRPCUtils.createErrorResponse(
          validation.error!,
          (message as any).id || null
        );
        return this.sendMessage(errorResponse, options);
      }
      const response = await this.processMessage(validation, options);

      // Send response if one was generated (requests only, not notifications)
      if (response && (!Array.isArray(response) || response.length > 0)) {
        return this.sendMessage(response, options);
      }
    } catch (err) {
      const error = err as Error;
      logger.error("Error handling validateMessage:", error);
      const errorResponse = JSONRPCUtils.createErrorResponse(
        this.config.errorHandler(error as Error),
        null
      );
      return this.sendMessage(errorResponse, options);
    }
  }

  /**
   * Get manager statistics
   */
  public getStats() {
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
  public destroy(): void {
    super.destroy();
    this.methods.clear();
  }
}
