import { z } from "zod";

const positionSchema = z.object({
  line: z.number().min(1),
  col: z.number().min(1),
});

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
  name: string;
  kind: string;
  detail?: string;
  id?: string; // Optional unique identifier
  uri?: string;
  content?: string; // The actual text content at this location
}

export interface Symbol extends SymbolBase {
  range: Range;
  children: Range[];
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
  children: VSCodeRange[];
  selectionRange?: VSCodeRange;
  originSelectionRange?: VSCodeRange;
}

// File system entry type
const fileEntrySchema = z.object({
  path: z.string().describe("Relative path from workspace root"),
  type: z.enum(["file", "directory"]).describe("Entry type"),
  lastModified: z
    .number()
    .describe("Last modified timestamp in milliseconds since epoch"),
});

export type FileEntryType = z.infer<typeof fileEntrySchema>;
