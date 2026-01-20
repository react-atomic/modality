/**
 * JSON-RPC 2.0 Utility Functions
 *
 * Utility class for JSON-RPC message handling, validation, and creation.
 * Extracted from schemas/jsonrpc.ts for independent use.
 */

import {
  JSONRPC_VERSION,
  JSONRPCErrorCode,
  type JSONRPCParams,
  type JSONRPCId,
  type JSONRPCRequest,
  type JSONRPCNotification,
  type JSONRPCSuccessResponse,
  type JSONRPCErrorResponse,
  type JSONRPCError,
  type JSONRPCResponse,
  type JSONRPCMessage,
  type JSONRPCValidationResult,
} from "./schemas/jsonrpc.js";

/**
 * Utility functions for JSON-RPC message handling
 */
export class JSONRPCUtils {
  /**
   * Validate a JSON-RPC message (supports batch requests)
   */
  static validateBatchMessage(message: any): JSONRPCValidationResult {
    // Handle batch requests
    if (Array.isArray(message)) {
      if (message.length === 0) {
        return {
          valid: false,
          message,
          error: JSONRPCUtils.createError(
            JSONRPCErrorCode.INVALID_REQUEST,
            "Invalid request: batch array cannot be empty"
          ),
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
    } else {
      return this.validateSingleMessage(message);
    }
  }

  /**
   * Validate a single JSON-RPC message
   */
  static validateSingleMessage(message: any): JSONRPCValidationResult {
    if (!message || typeof message !== "object") {
      return {
        valid: false,
        message,
        error: JSONRPCUtils.createError(
          JSONRPCErrorCode.INVALID_REQUEST,
          "Invalid request: message must be an object"
        ),
      };
    }

    if (message.jsonrpc !== JSONRPC_VERSION) {
      return {
        valid: false,
        message,
        error: JSONRPCUtils.createError(
          JSONRPCErrorCode.INVALID_REQUEST,
          `Invalid request: expect ${JSONRPC_VERSION}, received ${message.jsonrpc}`
        ),
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
        error: JSONRPCUtils.createError(
          JSONRPCErrorCode.INVALID_REQUEST,
          `Invalid request: method must be a string`
        ),
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
    return crypto.randomUUID();
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
  static deserialize(
    data: string | Buffer | Record<string, any>
  ): JSONRPCMessage | null {
    try {
      let messageStr: string;
      if (typeof data !== "string") {
        if (Buffer.isBuffer(data)) {
          messageStr = data.toString();
        } else {
          return data as JSONRPCMessage;
        }
      } else {
        messageStr = data;
      }
      return JSON.parse(messageStr);
    } catch {
      return null;
    }
  }
}
