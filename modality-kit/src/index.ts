export { formatErrorResponse, formatSuccessResponse } from "./util_response";
export { getLoggerInstance, type ModalityLogger } from "./util_logger";
export { withErrorHandling, ErrorCode } from "./util_error";

export * as SymbolTypes from "./schemas/schemas_symbol";
export type { EmptyType } from "./schemas/schemas_empty";
export { emptySchema } from "./schemas/schemas_empty";
export { loadVersion } from "./util_version";
export { compressWithLanguageDetection as compressText } from "./util_text_compression";

export { JSONRPCCall, createDataPendingOperations } from "./util_pending";
export type { DataPendingOperation, PendingOperation } from "./util_pending";

/**
 * JSON RPC related exports
 */
export { JSONRPCUtils } from "./JSONRPCUtils";
export { JSONRPCManager } from "./jsonrpc-manager";
export { JSONRPCErrorCode } from "./schemas/jsonrpc";
export type {
  JSONRPCManagerEvents,
  JSONRPCManagerConfig,
} from "./jsonrpc-manager";
export type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCNotification,
  JSONRPCResponse,
  JSONRPCBatchRequest,
  JSONRPCBatchResponse,
  JSONRPCErrorResponse,
  JSONRPCValidationResult,
  JSONRPCError,
  JSONRPCParams,
  CommandExecuteParams,
  NotificationSendParams,
} from "./schemas/jsonrpc";
export { ERROR_METHOD_NOT_FOUND } from "./jsonrpc-manager";

/**
 * For test tool
 */
export { isTestEnvironment } from "./util_tests/isTestEnvironment";

export { WebSocketClient } from "./websocket-client";
export { LruCache } from "./lruCache";
export { SimpleCache } from "./simple-cache";
export type { SimpleCacheOptions } from "./simple-cache";
