/**
 * Copy of StandardSchemaV1 interface for compatibility
 */
import { z } from "zod";

export interface ToolParameters<Input = unknown, Output = Input> {
  readonly "~standard": ToolParameters.Props<Input, Output>;
}

export namespace ToolParameters {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  export type Result<Output> = SuccessResult<Output> | FailureResult;
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  export interface PathSegment {
    readonly key: PropertyKey;
  }
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
  export type InferInput<Schema extends ToolParameters> = NonNullable<
    Schema["~standard"]["types"]
  >["input"];
  export type InferOutput<Schema extends ToolParameters> = NonNullable<
    Schema["~standard"]["types"]
  >["output"];
}

/**
 * Tool interface for AI SDK compatibility
 */
export interface AITool<
  T extends Record<string, unknown> | undefined = any,
  TParams extends ToolParameters = z.ZodSchema,
> {
  annotations?: {
    streamingHint?: boolean;
  } & {
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    readOnlyHint?: boolean;
    title?: string;
  };
  canAccess?: (auth: T) => boolean;
  description?: string;
  execute: (
    args: ToolParameters.InferOutput<TParams>,
    context?: any
  ) => Promise<any>;
  name?: string;
  inputSchema?: TParams;
  timeoutMs?: number;
}

export interface FastMCPTool<
  T extends Record<string, unknown> | undefined = any,
  TParams extends ToolParameters = ToolParameters,
> extends AITool<T, TParams> {
  parameters?: TParams;
  name: string;
}

/**
 * Type for a collection of AI tools with preserved schema types
 * @template T - Record mapping tool names to their inputSchema types
 * @example AITools<{getUserById: z.object({id: z.string()}), createUser: z.object({name: z.string()})}>
 */
export type AITools<
  T extends Record<string, ToolParameters> = Record<string, z.ZodSchema>,
> = {
  [K in keyof T]: AITool<any, T[K]>;
};
