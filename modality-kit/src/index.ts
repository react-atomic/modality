export { setupAITools } from "./util_mcp_tools_converter";
export type { AITools, AITool } from "./schemas/schemas_tool_config";

export { formatErrorResponse, formatSuccessResponse } from "./util_response";
export { getLoggerInstance, type ModalityLogger } from "./util_logger";
export { withErrorHandling, ErrorCode } from "./util_error";

export interface FileType {
  path: string;
  type: string;
}

// Symbol interfaces for type safety
export interface Range {
  start: { line: number; col: number };
  end: { line: number; col: number };
}

export interface Symbol<SymbolRange extends Range = Range> {
  range: SymbolRange;
  selectionRange: SymbolRange;
  name: string;
  detail: string;
  kind: string;
  children: Symbol<SymbolRange>[];
}