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
export type JSONRPCMethod<TParams = JSONRPCParams, TResult = any> = (
  method: string,
  params?: TParams,
  options?: any
) => Promise<TResult>;

/**
 * JSON-RPC 2.0 ID type - string, number, or null
 */
export type JSONRPCId = string | number | null;

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
 * Standard method parameter interfaces
 */
export interface CommandExecuteParams {
  command: string;
  args?: any[];
}
export interface NotificationSendParams {
  message: string;
  priority?: "low" | "normal" | "high" | "urgent";
}

/**
 * JSON-RPC 2.0 version identifier
 */
export const JSONRPC_VERSION = "2.0" as const;

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
export type JSONRPCParams = Record<any, any> | any[] | null;

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
