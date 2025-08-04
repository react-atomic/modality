/**
 * JSON-RPC 2.0 Types and Interfaces
 * @see https://www.jsonrpc.org/specification
 *
 * Comprehensive TypeScript definitions for JSON-RPC 2.0 specification
 * Provides type-safe interfaces for request/response/notification patterns
 * and utilities for message handling and validation.
 */

/**
 * Generic JSON-RPC method type for type-safe method definitions
 * Usage: type MyMethod = JSONRPCMethod<MyParams, MyResult>
 * Or as object: { methodName: JSONRPCMethod<MyParams, MyResult> }
 */
export const getUUID = () => crypto.randomUUID();
export type JSONRPCMethod<TParams = JSONRPCParams, TResult = any> = (
  method: string,
  params?: TParams,
  options?: any
) => Promise<TResult>;

/**
 * JSON-RPC 2.0 version identifier
 */
export const JSONRPC_VERSION = "2.0" as const;

/**
 * Standard JSON-RPC 2.0 error codes as defined in the specification
 */
export enum JSONRPCErrorCode {
  // Standard errors
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // Implementation defined server errors (-32000 to -32099)
  SERVER_ERROR_START = -32099,
  SERVER_ERROR_END = -32000,

  // Application specific errors (starting from -32000)
  TIMEOUT_ERROR = -32001,
  CONNECTION_ERROR = -32002,
  AUTHENTICATION_ERROR = -32003,
  AUTHORIZATION_ERROR = -32004,
  RATE_LIMIT_ERROR = -32005,
  VALIDATION_ERROR = -32006,
}

/**
 * JSON-RPC 2.0 parameter types - can be object, array, or null
 *
 * IMPORTANT: DO NOT add 'undefined' to this type!
 *
 * Reasoning per JSON-RPC 2.0 specification (https://www.jsonrpc.org/specification):
 * 1. JSON specification does not support 'undefined' - only null, objects, arrays, etc.
 * 2. JSON.stringify() omits undefined values, making {params: undefined} equivalent to {}
 * 3. JSON-RPC 2.0 spec defines params as: Object | Array | omitted entirely
 * 4. Use cases:
 *    - No parameters: omit 'params' field entirely
 *    - Explicit null: use 'params: null'
 *    - Empty object: use 'params: {}'
 *    - Empty array: use 'params: []'
 *
 * This ensures strict JSON-RPC 2.0 compliance and wire protocol compatibility.
 * See: https://www.jsonrpc.org/specification#parameter_structures
 */
export type JSONRPCParams = object | any[] | null;

/**
 * JSON-RPC 2.0 ID type - string, number, or null
 */
export type JSONRPCId = string | number | null;

/**
 * JSON-RPC 2.0 Error object
 */
export interface JSONRPCError {
  /** Error code indicating the error type */
  code: JSONRPCErrorCode | number;
  /** Human-readable error message */
  message: string;
  /** Optional additional error data */
  data?: any;
}

/**
 * JSON-RPC 2.0 Request object
 */
export interface JSONRPCRequest {
  /** JSON-RPC version identifier */
  jsonrpc: typeof JSONRPC_VERSION;
  /** Method name to be invoked */
  method: string;
  /** Optional parameters for the method */
  params?: JSONRPCParams;
  /** Request identifier for correlation with response */
  id: JSONRPCId;
}

/**
 * JSON-RPC 2.0 Notification object (request without id)
 */
export interface JSONRPCNotification {
  /** JSON-RPC version identifier */
  jsonrpc: typeof JSONRPC_VERSION;
  /** Method name to be invoked */
  method: string;
  /** Optional parameters for the method */
  params?: JSONRPCParams;
}

/**
 * JSON-RPC 2.0 Success Response object
 */
export interface JSONRPCSuccessResponse {
  /** JSON-RPC version identifier */
  jsonrpc: typeof JSONRPC_VERSION;
  /** Method result */
  result: any;
  /** Request identifier matching the original request */
  id: JSONRPCId;
}

/**
 * JSON-RPC 2.0 Error Response object
 */
export interface JSONRPCErrorResponse {
  /** JSON-RPC version identifier */
  jsonrpc: typeof JSONRPC_VERSION;
  /** Error information */
  error: JSONRPCError;
  /** Request identifier matching the original request */
  id: JSONRPCId;
}

/**
 * Union type for JSON-RPC 2.0 Response objects
 */
export type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse;

/**
 * JSON-RPC 2.0 Batch Request (array of requests and/or notifications)
 */
export type JSONRPCBatchRequest = (JSONRPCRequest | JSONRPCNotification)[];

/**
 * JSON-RPC 2.0 Batch Response (array of responses)
 */
export type JSONRPCBatchResponse = JSONRPCResponse[];

/**
 * Union type for all JSON-RPC 2.0 message types
 */
export type JSONRPCMessage =
  | JSONRPCRequest
  | JSONRPCNotification
  | JSONRPCResponse
  | JSONRPCBatchRequest
  | JSONRPCBatchResponse;

/**
 * JSON-RPC message validation result
 */
export interface JSONRPCValidationResult {
  /** Whether the message is valid */
  valid: boolean;
  message: JSONRPCMessage;
  /** Error information if validation failed */
  error?: JSONRPCError;
  /** Parsed message type */
  messageType?: "request" | "notification" | "response" | "batch";
}

/**
 * Utility functions for JSON-RPC message handling
 */
export class JSONRPCUtils {
  /**
   * Validate a JSON-RPC message (supports batch requests)
   */
  static validateMessage(message: any): JSONRPCValidationResult {
    // Handle batch requests
    if (Array.isArray(message)) {
      if (message.length === 0) {
        return {
          valid: false,
          message,
          error: {
            code: JSONRPCErrorCode.INVALID_REQUEST,
            message: "Invalid request: batch array cannot be empty",
          },
        };
      }

      // Validate each item in the batch
      for (const item of message) {
        const itemValidation = this.validateSingleMessage(item);
        if (!itemValidation.valid) {
          return itemValidation;
        }
      }

      return {
        valid: true,
        message,
        messageType: "batch",
      };
    }

    return this.validateSingleMessage(message);
  }

  /**
   * Validate a single JSON-RPC message
   */
  static validateSingleMessage(message: any): JSONRPCValidationResult {
    if (!message || typeof message !== "object") {
      return {
        valid: false,
        message,
        error: {
          code: JSONRPCErrorCode.INVALID_REQUEST,
          message: "Invalid request: message must be an object",
        },
      };
    }

    if (message.jsonrpc !== JSONRPC_VERSION) {
      return {
        valid: false,
        message,
        error: {
          code: JSONRPCErrorCode.INVALID_REQUEST,
          // refine message
          message: `Invalid request: expect ${JSONRPC_VERSION}, received ${message.jsonrpc}`,
        },
      };
    }

    if (!message.method || typeof message.method !== "string") {
      // Check if this is a response
      if ("result" in message || "error" in message) {
        return {
          valid: true,
          message,
          messageType: "response",
        };
      }

      return {
        valid: false,
        message,
        error: {
          code: JSONRPCErrorCode.INVALID_REQUEST,
          message: "Invalid request: method must be a string",
        },
      };
    }

    // Determine message type
    const hasId = "id" in message;
    const messageType = hasId ? "request" : "notification";

    return {
      valid: true,
      message,
      messageType,
    };
  }

  /**
   * Create a JSON-RPC request
   */
  static createRequest(
    method: string,
    params?: JSONRPCParams,
    options: { customId?: JSONRPCId } = {}
  ): JSONRPCRequest {
    return {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
      id: options.customId ?? this.generateId(),
    };
  }

  /**
   * Create a JSON-RPC notification
   */
  static createNotification(
    method: string,
    params?: JSONRPCParams
  ): JSONRPCNotification {
    return {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    };
  }

  /**
   * Create a JSON-RPC success response
   */
  static createSuccessResponse(
    result: any,
    id: JSONRPCId
  ): JSONRPCSuccessResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      result,
      id,
    };
  }

  /**
   * Create a JSON-RPC error response
   */
  static createErrorResponse(
    error: JSONRPCError,
    id: JSONRPCId
  ): JSONRPCErrorResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      error,
      id,
    };
  }

  /**
   * Create a standard JSON-RPC error
   */
  static createError(
    code: JSONRPCErrorCode | number,
    message: string,
    data?: any
  ): JSONRPCError {
    return { code, message, data };
  }

  /**
   * Generate a unique ID for requests
   */
  static generateId(): string {
    return getUUID();
  }

  /**
   * Check if a message is a JSON-RPC request
   */
  static isRequest(message: any): message is JSONRPCRequest {
    return (
      message &&
      message.jsonrpc === JSONRPC_VERSION &&
      typeof message.method === "string" &&
      "id" in message
    );
  }

  /**
   * Check if a message is a JSON-RPC notification
   */
  static isNotification(message: any): message is JSONRPCNotification {
    return (
      message &&
      message.jsonrpc === JSONRPC_VERSION &&
      typeof message.method === "string" &&
      !("id" in message)
    );
  }

  /**
   * Check if a message is a JSON-RPC response
   */
  static isResponse(message: any): message is JSONRPCResponse {
    return (
      message &&
      message.jsonrpc === JSONRPC_VERSION &&
      ("result" in message || "error" in message) &&
      "id" in message
    );
  }

  /**
   * Check if a response is a success response
   */
  static isSuccessResponse(
    response: JSONRPCResponse
  ): response is JSONRPCSuccessResponse {
    return "result" in response;
  }

  /**
   * Check if a response is an error response
   */
  static isErrorResponse(
    response: JSONRPCResponse
  ): response is JSONRPCErrorResponse {
    return "error" in response;
  }

  /**
   * Serialize a JSON-RPC message to string
   */
  static serialize(message: JSONRPCMessage): string {
    return JSON.stringify(message);
  }

  /**
   * Deserialize a JSON-RPC message from string
   */
  static deserialize(data: string): JSONRPCMessage | null {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}

/**
 * Standard error messages for common JSON-RPC errors
 */
export const STANDARD_ERROR_MESSAGES: Record<JSONRPCErrorCode, string> = {
  [JSONRPCErrorCode.PARSE_ERROR]: "Parse error",
  [JSONRPCErrorCode.INVALID_REQUEST]: "Invalid Request",
  [JSONRPCErrorCode.METHOD_NOT_FOUND]: "Method not found",
  [JSONRPCErrorCode.INVALID_PARAMS]: "Invalid params",
  [JSONRPCErrorCode.INTERNAL_ERROR]: "Internal error",
  [JSONRPCErrorCode.SERVER_ERROR_START]: "Server error",
  [JSONRPCErrorCode.SERVER_ERROR_END]: "Server error",
  [JSONRPCErrorCode.TIMEOUT_ERROR]: "Request timeout",
  [JSONRPCErrorCode.CONNECTION_ERROR]: "Connection error",
  [JSONRPCErrorCode.AUTHENTICATION_ERROR]: "Authentication required",
  [JSONRPCErrorCode.AUTHORIZATION_ERROR]: "Authorization failed",
  [JSONRPCErrorCode.RATE_LIMIT_ERROR]: "Rate limit exceeded",
  [JSONRPCErrorCode.VALIDATION_ERROR]: "Validation error",
};
