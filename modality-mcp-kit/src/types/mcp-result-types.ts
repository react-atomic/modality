/**
 * MCP Tool Result Types and Validators
 *
 * Provides type definitions and validation utilities for MCP CallToolResult
 * schema compliance. Supports multiple content types, structured data,
 * error handling, and metadata.
 */

import type {
  CallToolResult,
  ContentBlock,
  TextContent,
  ImageContent,
  AudioContent,
  ResourceLink,
  EmbeddedResource,
} from "@modelcontextprotocol/sdk/spec.types.js";

/**
 * Union type for tool execution results
 * Tools can return:
 * - string: Simple text result (backward compatible)
 * - CallToolResult: Full MCP result with content, structured data, errors, metadata
 * - object: Plain object that will be converted to structuredContent
 */
export type ToolExecuteResult =
  | string
  | CallToolResult
  | Record<string, unknown>
  | null
  | undefined;

/**
 * Type guards for result type detection
 */

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Check if value looks like it's intended to be a CallToolResult
 * (has content array field, regardless of validity)
 */
export function looksLikeCallToolResult(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  // If it has a content array field, it's intended to be CallToolResult
  return Array.isArray(obj.content);
}

export function isCallToolResult(value: unknown): value is CallToolResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.content) &&
    obj.content.length > 0 &&
    (typeof obj.isError === "undefined" || typeof obj.isError === "boolean") &&
    (typeof obj.structuredContent === "undefined" ||
      typeof obj.structuredContent === "object")
  );
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !isCallToolResult(value)
  );
}

export function isErrorResult(
  value: unknown
): value is CallToolResult & { isError: true } {
  return isCallToolResult(value) && value.isError === true;
}

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Type-safe ContentBlock validators
 */

export function isTextContent(block: unknown): block is TextContent {
  if (typeof block !== "object" || block === null) return false;
  const obj = block as Record<string, unknown>;
  return obj.type === "text" && typeof obj.text === "string";
}

export function isImageContent(block: unknown): block is ImageContent {
  if (typeof block !== "object" || block === null) return false;
  const obj = block as Record<string, unknown>;
  return (
    obj.type === "image" &&
    typeof obj.data === "string" &&
    typeof obj.mimeType === "string"
  );
}

export function isAudioContent(block: unknown): block is AudioContent {
  if (typeof block !== "object" || block === null) return false;
  const obj = block as Record<string, unknown>;
  return (
    obj.type === "audio" &&
    typeof obj.data === "string" &&
    typeof obj.mimeType === "string"
  );
}

export function isResourceLink(block: unknown): block is ResourceLink {
  if (typeof block !== "object" || block === null) return false;
  const obj = block as Record<string, unknown>;
  return obj.type === "resource_link";
}

export function isEmbeddedResource(block: unknown): block is EmbeddedResource {
  if (typeof block !== "object" || block === null) return false;
  const obj = block as Record<string, unknown>;
  return obj.type === "resource" && typeof obj.resource === "object";
}

export function isContentBlock(block: unknown): block is ContentBlock {
  return (
    isTextContent(block) ||
    isImageContent(block) ||
    isAudioContent(block) ||
    isResourceLink(block) ||
    isEmbeddedResource(block)
  );
}

/**
 * Validation result type
 */
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a single ContentBlock against MCP schema
 */
export function validateContentBlock(block: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof block !== "object" || block === null) {
    return {
      valid: false,
      errors: [{ field: "block", message: "Content block must be an object" }],
    };
  }

  const obj = block as Record<string, unknown>;
  const type = obj.type;

  // Validate type field exists
  if (typeof type !== "string") {
    return {
      valid: false,
      errors: [{ field: "type", message: "type field is required and must be a string" }],
    };
  }

  // Validate based on type
  switch (type) {
    case "text": {
      if (typeof obj.text !== "string") {
        errors.push({
          field: "text",
          message: "text field is required and must be a string",
        });
      }
      break;
    }
    case "image": {
      if (typeof obj.data !== "string") {
        errors.push({
          field: "data",
          message: "data field is required and must be a base64 string",
        });
      }
      if (typeof obj.mimeType !== "string") {
        errors.push({
          field: "mimeType",
          message: "mimeType field is required for image content",
        });
      }
      break;
    }
    case "audio": {
      if (typeof obj.data !== "string") {
        errors.push({
          field: "data",
          message: "data field is required and must be a base64 string",
        });
      }
      if (typeof obj.mimeType !== "string") {
        errors.push({
          field: "mimeType",
          message: "mimeType field is required for audio content",
        });
      }
      break;
    }
    case "resource_link":
    case "resource": {
      // More lenient validation for resource types
      break;
    }
    default: {
      errors.push({
        field: "type",
        message: `Invalid content type: ${type}. Must be one of: text, image, audio, resource_link, resource`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a complete CallToolResult against MCP schema
 */
export function validateCallToolResult(result: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof result !== "object" || result === null) {
    return {
      valid: false,
      errors: [
        {
          field: "result",
          message: "CallToolResult must be an object",
        },
      ],
    };
  }

  const obj = result as Record<string, unknown>;

  // Validate content array
  if (!Array.isArray(obj.content)) {
    errors.push({
      field: "content",
      message: "content field is required and must be an array",
    });
  } else if (obj.content.length === 0) {
    errors.push({
      field: "content",
      message: "content array cannot be empty",
    });
  } else {
    // Validate each content block
    obj.content.forEach((block, index) => {
      const blockValidation = validateContentBlock(block);
      if (!blockValidation.valid) {
        blockValidation.errors.forEach((err) => {
          errors.push({
            field: `content[${index}].${err.field}`,
            message: err.message,
          });
        });
      }
    });
  }

  // Validate optional fields
  if (
    typeof obj.isError !== "undefined" &&
    typeof obj.isError !== "boolean"
  ) {
    errors.push({
      field: "isError",
      message: "isError field must be a boolean if provided",
    });
  }

  if (
    typeof obj.structuredContent !== "undefined" &&
    (typeof obj.structuredContent !== "object" ||
      obj.structuredContent === null ||
      Array.isArray(obj.structuredContent))
  ) {
    errors.push({
      field: "structuredContent",
      message: "structuredContent field must be an object if provided",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a TextContent block
 */
export function createTextContent(
  text: string,
  annotations?: any,
  _meta?: any
): TextContent {
  const content: TextContent = {
    type: "text",
    text,
  };
  if (annotations) content.annotations = annotations;
  if (_meta) content._meta = _meta;
  return content;
}

/**
 * Creates a minimal valid CallToolResult with text content
 */
export function createSimpleResult(
  text: string,
  isError: boolean = false
): CallToolResult {
  return {
    content: [createTextContent(text)],
    ...(isError && { isError: true }),
  };
}
