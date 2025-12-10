/**
 * Console Mock Utility
 * 
 * Provides utilities for mocking console output during testing to keep test output clean.
 * Can be used across multiple test files for consistent console mocking.
 */

interface ConsoleMethods {
  log: typeof console.log;
  error: typeof console.error;
  warn: typeof console.warn;
  info: typeof console.info;
  debug: typeof console.debug;
  group: typeof console.group;
  groupEnd: typeof console.groupEnd;
  groupCollapsed: typeof console.groupCollapsed;
  dir: typeof console.dir;
  table: typeof console.table;
  time: typeof console.time;
  timeEnd: typeof console.timeEnd;
}

export class ConsoleMock {
  private originalMethods: ConsoleMethods | null = null;
  private isMocked = false;

  /**
   * Mock all console methods to prevent output during tests
   */
  mock(): void {
    if (this.isMocked) {
      return; // Already mocked
    }

    // Store original console methods
    this.originalMethods = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
      group: console.group,
      groupEnd: console.groupEnd,
      groupCollapsed: console.groupCollapsed,
      dir: console.dir,
      table: console.table,
      time: console.time,
      timeEnd: console.timeEnd,
    };

    // Replace console methods with no-op functions
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.group = () => {};
    console.groupEnd = () => {};
    console.groupCollapsed = () => {};
    console.dir = () => {};
    console.table = () => {};
    console.time = () => {};
    console.timeEnd = () => {};

    this.isMocked = true;
  }

  /**
   * Restore original console methods
   */
  restore(): void {
    if (!this.isMocked || !this.originalMethods) {
      return; // Not mocked or already restored
    }

    // Restore original console methods
    console.log = this.originalMethods.log;
    console.error = this.originalMethods.error;
    console.warn = this.originalMethods.warn;
    console.info = this.originalMethods.info;
    console.debug = this.originalMethods.debug;
    console.group = this.originalMethods.group;
    console.groupEnd = this.originalMethods.groupEnd;
    console.groupCollapsed = this.originalMethods.groupCollapsed;
    console.dir = this.originalMethods.dir;
    console.table = this.originalMethods.table;
    console.time = this.originalMethods.time;
    console.timeEnd = this.originalMethods.timeEnd;

    this.originalMethods = null;
    this.isMocked = false;
  }

  /**
   * Check if console is currently mocked
   */
  get isActive(): boolean {
    return this.isMocked;
  }

  /**
   * Temporarily restore console methods for debugging purposes
   * Returns a function to re-mock console methods
   */
  temporaryRestore(): () => void {
    if (!this.isMocked) {
      return () => {}; // Not mocked, return no-op
    }

    this.restore();
    return () => this.mock();
  }
}

// Global console mock instance (internal use)
const consoleMock = new ConsoleMock();

/**
 * Factory function to create a new ConsoleMock instance
 */
export function createConsoleMock(): ConsoleMock {
  return new ConsoleMock();
}

/**
 * Convenience functions for common usage patterns
 */

/**
 * Setup console mocking for a test suite (use in beforeAll)
 */
export function setupConsoleMock(): void {
  consoleMock.mock();
}

/**
 * Cleanup console mocking for a test suite (use in afterAll)
 */
export function cleanupConsoleMock(): void {
  consoleMock.restore();
}

/**
 * Higher-order function to run a function with console temporarily restored
 * Useful for debugging specific tests
 */
export function withConsole<T>(fn: () => T): T {
  const restoreMock = consoleMock.temporaryRestore();
  try {
    return fn();
  } finally {
    restoreMock();
  }
}

/**
 * Higher-order function to run an async function with console temporarily restored
 * Useful for debugging specific async tests
 */
export async function withConsoleAsync<T>(fn: () => Promise<T>): Promise<T> {
  const restoreMock = consoleMock.temporaryRestore();
  try {
    return await fn();
  } finally {
    restoreMock();
  }
}