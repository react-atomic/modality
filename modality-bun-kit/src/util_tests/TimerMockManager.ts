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
  private originalClearTimeout?: typeof clearTimeout;
  private originalMathRandom?: () => number;
  private mockSetTimeout?: any;
  private mockClearTimeout?: any;
  private activeTimers = new Map<any, Function>();
  private timerIdCounter = 0;
  private virtualClock: number = 0;
  private isDestroyed = false;
  private suppressTimeouts = false;

  /**
   * Setup timer mocks
   * @param executeImmediately - Whether to execute callbacks immediately (default: true for fast tests)
   * @param mockRandomValue - Fixed value for Math.random (default: 0 to eliminate jitter)
   */
  setup(executeImmediately: boolean = true, mockRandomValue: number = 0) {
    // Store originals
    this.originalSetTimeout = globalThis.setTimeout;
    this.originalClearTimeout = globalThis.clearTimeout;
    this.originalMathRandom = Math.random;

    // Mock Math.random to eliminate jitter
    Math.random = mock(() => mockRandomValue);

    // Mock setTimeout with virtual clock and timer tracking
    this.mockSetTimeout = mock((callback: Function, delay: number) => {
      this.virtualClock += delay;
      const timerId = ++this.timerIdCounter;
      
      if (executeImmediately && !this.suppressTimeouts) {
        // Execute callback immediately for fast tests, but track it
        this.activeTimers.set(timerId, callback);
        // Use queueMicrotask instead of setImmediate to allow synchronous operations to complete first
        queueMicrotask(() => {
          if (this.activeTimers.has(timerId) && !this.isDestroyed && !this.suppressTimeouts) {
            this.activeTimers.delete(timerId);
            callback();
          } else {
            this.activeTimers.delete(timerId);
          }
        });
      } else {
        // Use original setTimeout for real timing tests
        const realTimerId = this.originalSetTimeout!(callback as any, delay);
        this.activeTimers.set(timerId, callback);
        return realTimerId;
      }
      
      return timerId;
    });

    // Mock clearTimeout to handle timer cancellation
    this.mockClearTimeout = mock((timerId: any) => {
      if (this.activeTimers.has(timerId)) {
        this.activeTimers.delete(timerId);
      }
      if (this.originalClearTimeout) {
        this.originalClearTimeout(timerId);
      }
    });

    globalThis.setTimeout = this.mockSetTimeout as any;
    globalThis.clearTimeout = this.mockClearTimeout as any;
  }

  /**
   * Restore original timer functions
   */
  restore() {
    // Mark as destroyed to prevent callback execution
    this.isDestroyed = true;
    
    // Clear all active timers before restoring
    this.clearAllActiveTimers();
    
    if (this.originalSetTimeout) {
      globalThis.setTimeout = this.originalSetTimeout;
    }
    if (this.originalClearTimeout) {
      globalThis.clearTimeout = this.originalClearTimeout;
    }
    if (this.originalMathRandom) {
      Math.random = this.originalMathRandom;
    }
    
    this.virtualClock = 0;
    this.timerIdCounter = 0;
    this.activeTimers.clear();
    this.mockSetTimeout?.mockClear();
    this.mockClearTimeout?.mockClear();
    this.isDestroyed = false; // Reset for next use
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
   * Clear all active timers
   */
  clearAllActiveTimers() {
    this.activeTimers.clear();
  }

  /**
   * Get the number of active timers
   */
  getActiveTimerCount(): number {
    return this.activeTimers.size;
  }

  /**
   * Suppress timeout execution temporarily
   */
  suppressTimeoutExecution(): void {
    this.suppressTimeouts = true;
  }

  /**
   * Resume timeout execution
   */
  resumeTimeoutExecution(): void {
    this.suppressTimeouts = false;
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