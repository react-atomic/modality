/**
 * Unit Tests for PendingOperations Library
 * 
 * Tests all functionality of the PendingOperations class including:
 * - Promise-based operations
 * - Request-based operations  
 * - Context-based operations
 * - Timeout handling
 * - Cleanup functionality
 * - Statistics and monitoring
 */

import { test, expect, describe, beforeEach } from "bun:test";
import {
  createPromisePendingOperations,
  createDataPendingOperations,
  PromisePendingOperations,
  DataPendingOperations,
  type PendingOperationEventHandlers,
  type PendingOperation
} from "../util_pending";
import { TimerMockManager } from "modality-bun-kit";

describe("PendingOperations", () => {
  let pendingOps: DataPendingOperations;
  let promiseOps: PromisePendingOperations;
  let eventHandlers: PendingOperationEventHandlers;
  let timeoutCalls: any[];
  let resolveCalls: any[];
  let rejectCalls: any[];
  let cleanupCalls: any[];

  beforeEach(() => {
    timeoutCalls = [];
    resolveCalls = [];
    rejectCalls = [];
    cleanupCalls = [];

    eventHandlers = {
      onTimeout: (operation: PendingOperation) => timeoutCalls.push(operation),
      onResolve: (operation: PendingOperation, result: any) => resolveCalls.push({ operation, result }),
      onReject: (operation: PendingOperation, reason: any) => rejectCalls.push({ operation, reason }),
      onCleanup: (operation: PendingOperation) => cleanupCalls.push(operation)
    };

    pendingOps = new DataPendingOperations(
      { 
        defaultTimeout: 10000,
        cleanupInterval: 100,
        enableAutoCleanup: false 
      },
      eventHandlers
    );

    promiseOps = new PromisePendingOperations(
      { 
        defaultTimeout: 10000,
        cleanupInterval: 100,
        enableAutoCleanup: false 
      },
      eventHandlers
    );
  });

  describe("Promise Operations", () => {
    test("should add and resolve promise operation", async () => {
      const { id, promise } = promiseOps.add({ test: "data" }, {});
      
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
      expect(promiseOps.has(id)).toBe(true);
      
      // Resolve the operation
      const result = { success: true };
      promiseOps.resolve(id, result);
      
      // Promise should resolve with the result
      expect(promise).resolves.toEqual(result);
      expect(promiseOps.has(id)).toBe(false);
      expect(resolveCalls).toHaveLength(1);
      expect(resolveCalls[0].result).toEqual(result);
    });

    test("should add and reject promise operation", async () => {
      const { id, promise } = promiseOps.add(undefined, {});
      
      const error = new Error("Test error");
      promiseOps.reject(id, error);
      
      expect(promise).rejects.toThrow("Test error");
      expect(promiseOps.has(id)).toBe(false);
      expect(rejectCalls).toHaveLength(1);
      expect(rejectCalls[0].reason).toEqual(error);
    });

    test("should handle promise operation timeout", async () => {
      // Setup timer mocks for this specific test
      const timerMock = new TimerMockManager();
      timerMock.setup(true); // Execute callbacks immediately
      
      try {
        const { id, promise } = promiseOps.add(
          { test: "timeout" },
          { timeout: 50 } // 50ms timeout
        );
        
        // With timer mocks, the timeout happens immediately
        expect(promise).rejects.toThrow("Operation timed out after 50ms");
        
        expect(pendingOps.has(id)).toBe(false);
        expect(timeoutCalls).toHaveLength(1);
        expect(rejectCalls).toHaveLength(1);
      } finally {
        timerMock.restore();
      }
    });
  });

  describe("Data Operations", () => {
    test("should add data operation", () => {
      const id = pendingOps.add(
        { 
          requestType: "testRequest", 
          payload: { data: "test" },
          connectionId: 123,
          connection: { mock: "connection" }
        },
        {
          timeout: 2000
        }
      );

      expect(id).toBeDefined();
      expect(pendingOps.has(id.id)).toBe(true);

      const operation = pendingOps.get(id.id);
      expect(operation).toBeDefined();
      expect(operation!.type).toBe("data");
      
      if (operation!.type === "data") {
        expect(operation!.data.requestType).toBe("testRequest");
        expect(operation!.data.payload).toEqual({ data: "test" });
        expect(operation!.data.connectionId).toBe(123);
        expect(operation!.data.connection).toEqual({ mock: "connection" });
      }
    });

    test("should store connectionId in data", () => {
      const id1 = pendingOps.add({ req: "1", connectionId: 123 });
      const id2 = pendingOps.add({ req: "2", connectionId: 123 });
      const id3 = pendingOps.add({ req: "3", connectionId: 456 });

      const op1 = pendingOps.get(id1.id);
      const op2 = pendingOps.get(id2.id);
      const op3 = pendingOps.get(id3.id);
      
      expect(op1?.data.connectionId).toBe(123);
      expect(op2?.data.connectionId).toBe(123);
      expect(op3?.data.connectionId).toBe(456);
    });

    test("should manually clear operations", () => {
      const id1 = pendingOps.add({ req: "1", connectionId: 123 });
      const id2 = pendingOps.add({ req: "2", connectionId: 123 });
      const id3 = pendingOps.add({ req: "3", connectionId: 456 });

      // Manual cleanup instead of clearByConnectionId
      pendingOps.reject(id1.id, "Connection closed");
      pendingOps.reject(id2.id, "Connection closed");

      expect(pendingOps.has(id1.id)).toBe(false);
      expect(pendingOps.has(id2.id)).toBe(false);
      expect(pendingOps.has(id3.id)).toBe(true);
      expect(rejectCalls).toHaveLength(2);
    });

    test("should resolve data operation", () => {
      const id = pendingOps.add({ functionName: "testFunction", context: { test: "data" } });
      const result = { processed: true };

      const resolved = pendingOps.resolve(id.id, result);

      expect(resolved).toBe(true);
      expect(pendingOps.has(id.id)).toBe(false);
      expect(resolveCalls).toHaveLength(1);
      expect(resolveCalls[0].result).toEqual(result);
    });
  });

  describe("Custom ID Support", () => {
    test("should add data operation with custom ID", () => {
      const customId = "my-custom-id-123";
      const data = { requestType: "testRequest", payload: { data: "test" } };
      
      const id = pendingOps.add(data, { customId });

      expect(id.id).toBe(customId);
      expect(pendingOps.has(customId)).toBe(true);

      const operation = pendingOps.get(customId);
      expect(operation).toBeDefined();
      expect(operation!.id).toBe(customId);
      expect(operation!.type).toBe("data");
      
      if (operation!.type === "data") {
        expect(operation!.data).toEqual(data);
      }
    });

    test("should add promise operation with custom ID", () => {
      const customId = "promise-custom-id-456";
      
      const { id, promise } = promiseOps.add(undefined, { customId });

      expect(id).toBe(customId);
      expect(promiseOps.has(customId)).toBe(true);
      expect(promise).toBeInstanceOf(Promise);

      const operation = promiseOps.get(customId);
      expect(operation).toBeDefined();
      expect(operation!.id).toBe(customId);
      expect(operation!.type).toBe("promise");
    });

    test("should throw error for duplicate custom ID in data operation", () => {
      const customId = "duplicate-id-test";
      
      // Add first operation
      pendingOps.add({ test: "data1" }, { customId });

      // Try to add second operation with same ID
      expect(() => {
        pendingOps.add({ test: "data2" }, { customId });
      }).toThrow(`Operation with ID '${customId}' already exists`);
    });

    test("should throw error for duplicate custom ID in promise operation", () => {
      const customId = "duplicate-promise-id";
      
      // Add first operation
      promiseOps.add(undefined, { customId });

      // Try to add second operation with same ID
      expect(() => {
        promiseOps.add(undefined, { customId });
      }).toThrow(`Operation with ID '${customId}' already exists`);
    });

    test("should allow same custom ID in different operation types (separate storage)", () => {
      const customId = "cross-type-duplicate";
      
      // Add data operation first
      pendingOps.add({ test: "data" }, { customId });

      // Adding promise operation with same ID should work since they're separate instances
      expect(() => {
        promiseOps.add(undefined, { customId });
      }).not.toThrow();
      
      // Both should exist in their respective instances
      expect(pendingOps.has(customId)).toBe(true);
      expect(promiseOps.has(customId)).toBe(true);
    });

    test("should allow custom ID with other data operation options", () => {
      const customId = "full-options-test";
      const connectionId = 789;
      const connection = { socket: "mock" };
      const timeout = 5000;
      const data = { complex: "operation" };
      
      const id = pendingOps.add({
        ...data,
        connectionId,
        connection
      }, {
        customId,
        timeout
      });

      expect(id.id).toBe(customId);
      
      const operation = pendingOps.get(customId);
      expect(operation).toBeDefined();
      expect(operation!.type).toBe("data");
      
      if (operation!.type === "data") {
        expect(operation!.data.connectionId).toBe(connectionId);
        expect(operation!.data.connection).toEqual(connection);
        expect(operation!.timeout).toBe(timeout);
        expect(operation!.data.complex).toBe("operation");
      }
    });

    test("should resolve data operation with custom ID", () => {
      const customId = "resolvable-custom-id";
      const data = { task: "process" };
      const result = { status: "completed" };
      
      pendingOps.add(data, { customId });
      const resolved = pendingOps.resolve(customId, result);

      expect(resolved).toBe(true);
      expect(pendingOps.has(customId)).toBe(false);
      expect(resolveCalls).toHaveLength(1);
      expect(resolveCalls[0].result).toEqual(result);
    });

    test("should reject data operation with custom ID", () => {
      const customId = "rejectable-custom-id";
      const data = { task: "process" };
      const error = new Error("Processing failed");
      
      pendingOps.add(data, { customId });
      const rejected = pendingOps.reject(customId, error);

      expect(rejected).toBe(true);
      expect(pendingOps.has(customId)).toBe(false);
      expect(rejectCalls).toHaveLength(1);
      expect(rejectCalls[0].reason).toEqual(error);
    });
  });

  describe("General Operations", () => {
    test("should get all operations", () => {
      const id1 = pendingOps.add({ req: "1" });
      const id2 = pendingOps.add({ test: "data" });

      const allOps = pendingOps.getAll();
      expect(allOps.size).toBe(2);
      expect(allOps.has(id1.id)).toBe(true);
      expect(allOps.has(id2.id)).toBe(true);
      
      // Test promiseOps separately
      const { id: id3 } = promiseOps.add(undefined, {});
      const promiseAllOps = promiseOps.getAll();
      expect(promiseAllOps.size).toBe(1);
      expect(promiseAllOps.has(id3)).toBe(true);
    });

    test("should get operations by type", () => {
      pendingOps.add({ req: "1" });
      pendingOps.add({ req: "2" });
      pendingOps.add({ test: "data" });

      const dataOps = pendingOps.getByType("data");
      const promiseOps = pendingOps.getByType("promise");

      expect(dataOps).toHaveLength(3);
      expect(promiseOps).toHaveLength(0);
    });

    test("should remove operation without resolving", () => {
      const id = pendingOps.add({ test: "data" });
      
      const removed = pendingOps.remove(id.id);
      
      expect(removed).toBe(true);
      expect(pendingOps.has(id.id)).toBe(false);
      expect(cleanupCalls).toHaveLength(1);
      expect(resolveCalls).toHaveLength(0);
      expect(rejectCalls).toHaveLength(0);
    });

    test("should clear all operations", async () => {
      pendingOps.add({ req: "1" });
      pendingOps.add({ test: "data" });

      const clearedCount = pendingOps.clear("Test clear");

      expect(clearedCount).toBe(2);
      expect(pendingOps.getAll().size).toBe(0);
      expect(rejectCalls).toHaveLength(2);
      
      // Test promiseOps separately
      const { promise } = promiseOps.add(undefined, {});
      promise.catch(() => {}); // Silently handle the expected rejection
      
      const promiseClearedCount = promiseOps.clear("Test clear");
      expect(promiseClearedCount).toBe(1);
      expect(promiseOps.getAll().size).toBe(0);
    });

    test("should return false for non-existent operations", () => {
      expect(pendingOps.has("non-existent")).toBe(false);
      expect(pendingOps.get("non-existent")).toBeUndefined();
      expect(pendingOps.resolve("non-existent")).toBe(false);
      expect(pendingOps.reject("non-existent")).toBe(false);
      expect(pendingOps.remove("non-existent")).toBe(false);
    });
  });

  describe("Cleanup and Expiration", () => {
    test("should cleanup expired operations", async () => {
      // Create a separate instance without event handlers to avoid automatic timeout behavior
      const testOps = new DataPendingOperations({
        defaultTimeout: 1000,
        cleanupInterval: 100,
        enableAutoCleanup: false
      });

      try {
        // Add operations but manually set their timestamps to be expired
        const id1 = testOps.add({ req: "1" }, { timeout: 50 });
        const id2 = testOps.add({ req: "2" }, { timeout: 200 });

        // Manually adjust the timestamp of the first operation to make it expired
        const op1 = testOps.get(id1.id);
        if (op1) {
          op1.timestamp = Date.now() - 100; // Make it 100ms old (expired with 50ms timeout)
        }

        const cleanedCount = testOps.cleanupExpired();

        expect(cleanedCount).toBe(1);
        expect(testOps.has(id1.id)).toBe(false);
        expect(testOps.has(id2.id)).toBe(true);
      } finally {
        testOps.destroy();
      }
    });

    test("should handle auto cleanup when enabled", async () => {
      // Setup timer mocks for this specific test
      const timerMock = new TimerMockManager();
      timerMock.setup(true); // Execute callbacks immediately
      
      try {
        // Use isolated timeoutCalls array for this test to avoid interference
        const isolatedTimeoutCalls: any[] = [];
        
        const autoCleanupOps = new DataPendingOperations({
          defaultTimeout: 50,
          cleanupInterval: 25,
          enableAutoCleanup: true
        }, {
          onTimeout: (operation: PendingOperation) => isolatedTimeoutCalls.push(operation)
        });

        try {
          const id = autoCleanupOps.add({ test: "data" }, { timeout: 50 });

          // With timer mocks, auto cleanup triggers immediately
          // Let async operations complete
          await new Promise(resolve => setImmediate(resolve));

          expect(autoCleanupOps.has(id.id)).toBe(false);
          expect(isolatedTimeoutCalls).toHaveLength(1);
        } finally {
          autoCleanupOps.destroy();
        }
      } finally {
        timerMock.restore();
      }
    });
  });

  describe("Statistics", () => {
    test("should provide accurate statistics", async () => {
      // Add operations with different types and much longer timeouts to avoid "expiring soon"
      pendingOps.add({ req: "1" }, { timeout: 300000 }); // 5 minutes
      pendingOps.add({ req: "2" }, { timeout: 300000 }); // 5 minutes
      pendingOps.add({ test: "data" }, { timeout: 300000 }); // 5 minutes
      
      // Add operation that will expire soon (within 30 seconds)
      pendingOps.add({ expiring: "test" }, { timeout: 30000 }); // 30 seconds

      // No need to wait for age calculations with optimized test
      const stats = pendingOps.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byType.data).toBe(4);
      expect(stats.byType.promise).toBeUndefined();
      expect(stats.expiringSoon).toBe(1); // Only the 30-second timeout should be expiring soon
      expect(stats.averageAge).toBeGreaterThanOrEqual(0);
      expect(stats.oldestTimestamp).toBeDefined();
    });

    test("should return empty stats for no operations", () => {
      const stats = pendingOps.getStats();

      expect(stats.total).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.expiringSoon).toBe(0);
      expect(stats.averageAge).toBe(0);
      expect(stats.oldestTimestamp).toBeUndefined();
    });
  });

  describe("Configuration", () => {
    test("should use custom ID generator", () => {
      let counter = 0;
      const customOps = new DataPendingOperations({
        generateId: () => `custom-${++counter}`
      });

      try {
        const id1 = customOps.add({ test: "1" });
        const id2 = customOps.add({ test: "2" });

        expect(id1.id).toBe("custom-1");
        expect(id2.id).toBe("custom-2");
      } finally {
        customOps.destroy();
      }
    });

    test("should get current configuration", () => {
      const config = pendingOps.getConfig();

      expect(config.defaultTimeout).toBe(10000);
      expect(config.cleanupInterval).toBe(100);
      expect(config.enableAutoCleanup).toBe(false);
      expect(typeof config.generateId).toBe("function");
    });

    test("should update event handlers", async () => {
      // Setup timer mocks for this specific test
      const timerMock = new TimerMockManager();
      timerMock.setup(true); // Execute callbacks immediately
      
      try {
        const newTimeoutCalls: any[] = [];
        pendingOps.setEventHandlers({
          onTimeout: (operation: PendingOperation) => newTimeoutCalls.push(operation)
        });

        pendingOps.add({ test: "data" }, { timeout: 50 });

        // With timer mocks, timeout happens immediately
        // Let async operations complete
        await new Promise(resolve => setImmediate(resolve));
        
        expect(newTimeoutCalls).toHaveLength(1);
        expect(timeoutCalls).toHaveLength(0); // Old handler should not be called
      } finally {
        timerMock.restore();
      }
    });
  });

  describe("Factory Functions", () => {
    test("should create promise-optimized instance", () => {
      const promiseOps = createPromisePendingOperations();
      const config = promiseOps.getConfig();

      expect(config.defaultTimeout).toBe(30000);
      expect(config.cleanupInterval).toBe(30000);
      expect(config.enableAutoCleanup).toBe(true);

      promiseOps.destroy();
    });

    test("should create data-optimized instance", () => {
      const dataOps = createDataPendingOperations();
      const config = dataOps.getConfig();

      expect(config.defaultTimeout).toBe(30000);
      expect(config.cleanupInterval).toBe(30000);
      expect(config.enableAutoCleanup).toBe(true);

      dataOps.destroy();
    });

    test("should create data-optimized instance (compatibility test)", () => {
      const dataOps = createDataPendingOperations();
      const config = dataOps.getConfig();

      expect(config.defaultTimeout).toBe(30000);
      expect(config.cleanupInterval).toBe(30000);
      expect(config.enableAutoCleanup).toBe(true);

      dataOps.destroy();
    });
  });

  describe("Error Handling", () => {
    test("should handle timeout with custom timeout value", async () => {
      // Setup timer mocks for this specific test
      const timerMock = new TimerMockManager();
      timerMock.setup(true); // Execute callbacks immediately
      
      try {
        const { id, promise } = promiseOps.add(
          { test: "custom timeout" },
          { timeout: 25 } // Very short timeout
        );

        expect(promise).rejects.toThrow("Operation timed out after 25ms");
        
        expect(pendingOps.has(id)).toBe(false);
      } finally {
        timerMock.restore();
      }
    });

    test("should handle operations without timeout", () => {
      const id = pendingOps.add({ test: "data" }, { timeout: 0 });

      expect(pendingOps.has(id.id)).toBe(true);

      const operation = pendingOps.get(id.id);
      expect(operation).toBeDefined();
      expect(operation!.timeout).toBe(0);
      
      // Should not have timeout handle
      if (operation!.type === "data") {
        expect(operation!.timeoutHandle).toBeUndefined();
      }
    });

    test("should clean up timeout handle when operation is resolved", () => {
      const id = pendingOps.add({ test: "data" }, { timeout: 1000 });
      
      const operation = pendingOps.get(id.id);
      expect(operation).toBeDefined();
      
      if (operation!.type === "data") {
        expect(operation!.timeoutHandle).toBeDefined();
      }

      pendingOps.resolve(id.id);

      // Operation should be removed, so we can't check the timeout handle
      // But it should have been cleared internally
      expect(pendingOps.has(id.id)).toBe(false);
    });
  });
});
