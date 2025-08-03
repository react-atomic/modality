import { mock, expect } from "bun:test";

/**
 * Timer Mock Utilities
 * 
 * These utilities provide centralized timer mocking for tests that need to control time.
 * This ensures consistent behavior across all tests that use setTimeout, setInterval, etc.
 */

/**
 * Centralized timer mock manager for controlling time in tests
 * 
 * Features:
 * - Mock setTimeout with virtual clock advancement
 * - Mock Math.random for deterministic jitter elimination
 * - Track virtual time progression
 * - Immediate callback execution for fast tests
 * 
 * Usage:
 * ```typescript
 * import { TimerMockManager } from "../util_tests/TimerMockManager.js";
 * 
 * let timerMock: TimerMockManager;
 * 
 * beforeEach(() => {
 *   timerMock = new TimerMockManager();
 *   timerMock.setup();
 * });
 * 
 * afterEach(() => {
 *   timerMock.restore();
 * });
 * ```
 */
export class TimerMockManager {
  private originalSetTimeout?: typeof setTimeout;
  private originalMathRandom?: () => number;
  private mockSetTimeout?: any;
  private virtualClock: number = 0;

  /**
   * Setup timer mocks
   * @param executeImmediately - Whether to execute callbacks immediately (default: true for fast tests)
   * @param mockRandomValue - Fixed value for Math.random (default: 0 to eliminate jitter)
   */
  setup(executeImmediately: boolean = true, mockRandomValue: number = 0) {
    // Store originals
    this.originalSetTimeout = globalThis.setTimeout;
    this.originalMathRandom = Math.random;

    // Mock Math.random to eliminate jitter
    Math.random = mock(() => mockRandomValue);

    // Mock setTimeout with virtual clock
    this.mockSetTimeout = mock((callback: Function, delay: number) => {
      this.virtualClock += delay;
      
      if (executeImmediately) {
        // Execute callback immediately for fast tests
        setImmediate(() => callback());
      } else {
        // Use original setTimeout for real timing tests
        return this.originalSetTimeout!(callback as any, delay);
      }
      
      return {} as any; // Mock timer ID
    });

    globalThis.setTimeout = this.mockSetTimeout as any;
  }

  /**
   * Restore original timer functions
   */
  restore() {
    if (this.originalSetTimeout) {
      globalThis.setTimeout = this.originalSetTimeout;
    }
    if (this.originalMathRandom) {
      Math.random = this.originalMathRandom;
    }
    
    this.virtualClock = 0;
    this.mockSetTimeout?.mockClear();
  }

  /**
   * Get the current virtual clock time
   */
  getVirtualClock(): number {
    return this.virtualClock;
  }

  /**
   * Reset virtual clock to zero
   */
  resetClock() {
    this.virtualClock = 0;
  }

  /**
   * Get the mock setTimeout function for assertions
   */
  getMockSetTimeout() {
    return this.mockSetTimeout;
  }

  /**
   * Verify that setTimeout was called with expected parameters
   */
  expectSetTimeoutCalled(times: number, delay?: number) {
    if (!this.mockSetTimeout) {
      throw new Error("Timer mock not setup. Call setup() first.");
    }
    
    if (delay !== undefined) {
      expect(this.mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), delay);
    }
    expect(this.mockSetTimeout).toHaveBeenCalledTimes(times);
  }
}