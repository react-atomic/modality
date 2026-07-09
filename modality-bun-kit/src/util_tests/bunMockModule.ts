/**
 * bunMockModule - A utility for mocking Bun modules in tests
 * Leverages Bun's native mock.module() functionality with simplified lifecycle management
 */

import { mock } from "bun:test";
import { resolve } from "node:path";

type MockFactory<T = any> = () => T;
type ResetFunction = () => void;

// Store original modules for restoration
const moduleStore = new Map<string, any>();

/**
 * Mock a Bun module with automatic lifecycle management
 * @param modulePath - Relative or absolute path to the module to mock
 * @param mockFactory - Function that returns the mock object
 * @param callerDir - Optional directory context for resolving relative paths (defaults to current working directory)
 * @returns A reset function that restores the original module (best-effort; if
 *          the original couldn't be imported, the mock stays in place)
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

  // Store original module — best-effort, graceful fallback on failure.
  // When the module has deep transitive dependencies that can't be resolved
  // (e.g. vscode, modality-kit side-effect imports), dynamic import throws.
  // Instead of failing entirely, we still apply the mock so bunMockModule
  // works for ANY module regardless of dependency chain depth.
  let originalStored = false;
  try {
    const original = await import(resolvedPath);
    moduleStore.set(resolvedPath, { ...original });
    originalStored = true;
  } catch {
    // Graceful: original unavailable → can't restore later, but mock works.
    // NOTE: This swallows ALL import errors (syntax errors, circular deps, OOM, etc.)
    // by design. If the target module has a real defect, no diagnostic propagates
    // from here — the mock will be applied and tests may pass against the mock,
    // potentially masking the issue. This is an accepted trade-off for the use case
    // of mocking modules with unresolvable transitive dependencies (vscode, etc.).
  }

  // Mock the module using Bun's mock.module()
  const mockObject = mockFactory();
  mock.module(resolvedPath, () => mockObject);

  return () => {
    if (originalStored && moduleStore.has(resolvedPath)) {
      mock.module(resolvedPath, () => ({ ...moduleStore.get(resolvedPath) }));
    } else {
      // Original never stored — re-mock as empty so the caller gets
      // a clean slate (previous mock is cleared)
      mock.module(resolvedPath, () => ({}));
    }
  };
}

/**
 * Clear all stored mock originals from the module store.
 * Useful in test teardown when you want to wipe all tracked mocks.
 * Does NOT un-mock modules — it only clears the restore cache.
 * Call individual reset functions first to restore originals, then
 * call this to release references.
 */
export function clearAllMocks(): void {
  moduleStore.clear();
}
