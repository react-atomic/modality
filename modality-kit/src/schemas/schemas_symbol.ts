import { z } from "zod";

const positionSchema = z.object({
  line: z.number().min(1),
  col: z.number().min(1),
});

export const symbolKinds = [
  "File",
  "Module",
  "Namespace",
  "Package",
  "Class",
  "Method",
  "Property",
  "Field",
  "Constructor",
  "Enum",
  "Interface",
  "Function",
  "Variable",
  "Constant",
  "String",
  "Number",
  "Boolean",
  "Array",
  "Object",
  "Key",
  "Null",
  "EnumMember",
  "Struct",
  "Event",
  "Operator",
  "TypeParameter",
] as const;

// Symbol kinds enum
export const symbolKindSchema = z
  .enum(symbolKinds)
  .describe("Symbol kinds enumeration");

export type SymbolKindType = z.infer<typeof symbolKindSchema>;

// Simple range schema with {line, col} positions
export const rangeSchema = z
  .object({
    start: positionSchema,
    end: positionSchema,
  })
  .describe("Range with {line, col} positions");

export type Position = z.infer<typeof positionSchema>;
export type Range = z.infer<typeof rangeSchema>;

interface SymbolBase {
  name?: string;
  kind?: SymbolKindType;
  id?: string; // Optional unique identifier
  uri?: string;
  detail?: string;
  content?: string; // The actual text content at this location
}

export interface Symbol extends SymbolBase {
  range: Range;
  children?: Symbol[];
  selectionRange?: Range;
  originSelectionRange?: Range;
}

export interface VSCodePosition {
  line: number; // Line number (0-based)
  character: number; // Character number (0-based)
}

export interface VSCodeRange {
  start: VSCodePosition;
  end: VSCodePosition;
}

export interface VSCodeSymbol extends SymbolBase {
  range: VSCodeRange;
  children?: VSCodeSymbol[];
  selectionRange?: VSCodeRange;
  originSelectionRange?: VSCodeRange;
}

// File system entry type
const fileEntrySchema = z.object({
  path: z.string().describe("Relative path from workspace root"),
  type: z.enum(["file", "directory"]).describe("Entry type"),
  lastModified: z
    .number()
    .optional()
    .nullable()
    .describe("Last modified timestamp in milliseconds since epoch"),
});

export type FileEntryType = z.infer<typeof fileEntrySchema>;
