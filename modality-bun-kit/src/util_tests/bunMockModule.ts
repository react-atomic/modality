/**
 * bunMockModule - A utility for mocking Bun modules in tests
 * Leverages Bun's native mock.module() functionality with simplified lifecycle management
 */

import { mock } from "bun:test";
import { resolve } from "path";

type MockFactory<T = any> = () => T;
type ResetFunction = () => void;

// Store original modules for restoration
const moduleStore = new Map<string, any>();

/**
 * Mock a Bun module with automatic lifecycle management
 * @param modulePath - Relative or absolute path to the module to mock
 * @param mockFactory - Function that returns the mock object
 * @param callerDir - Optional directory context for resolving relative paths (defaults to current working directory)
 * @returns A reset function that restores the original module
 * @throws Error if path is invalid or mockFactory is not a function
 */
export async function bunMockModule<T>(
  modulePath: string,
  mockFactory: MockFactory<T>,
  callerDir?: string
): Promise<ResetFunction> {
  // Validate inputs
  if (!modulePath || typeof modulePath !== "string") {
    throw new Error("Invalid module path: path must be a non-empty string");
  }

  if (typeof mockFactory !== "function") {
    throw new Error("Invalid mock factory: mockFactory must be a function");
  }

  // Resolve module path relative to caller directory if provided and path is relative
  const resolvedPath = modulePath.startsWith(".")
    ? resolve(callerDir || process.cwd(), modulePath)
    : modulePath;

  // Store original module if not already stored
  try {
    const original = await import(resolvedPath);
    moduleStore.set(resolvedPath, {...original });
  } catch (error) {
    throw new Error(
      `Failed to import module "${resolvedPath}": ${(error as Error).message}`
    );
  }

  // Mock the module using Bun's mock.module()
  const mockObject = mockFactory();
  mock.module(resolvedPath, () => mockObject);

  // Return reset function that restores the original module
  // IMPORTANT: Return the original module object directly, not spread
  // Bun's mock.module() can properly handle ES Module objects for restoration
  return () => {
    mock.module(resolvedPath, () => ({...moduleStore.get(resolvedPath)}) );
  };
}
