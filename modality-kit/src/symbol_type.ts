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
  detail: string;
  kind: string;
}

export interface Symbol extends SymbolBase {
  range: Range;
  selectionRange: Range;
  children: Range[];
}

export interface VsCodePosition {
  line: number; // Line number (0-based)
  character: number; // Character number (0-based)
}

export interface VsCodeRange {
  start: VsCodePosition;
  end: VsCodePosition;
}

export interface VsCodeSymbol extends SymbolBase {
  range: VsCodeRange;
  selectionRange: VsCodeRange;
  children: VsCodeRange[];
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
