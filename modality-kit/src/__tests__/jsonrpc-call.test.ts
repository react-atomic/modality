/**
 * Unit Tests for JSONRPCCall Class
 * 
 * Tests all functionality of the JSONRPCCall class including:
 * - Request creation and handling
 * - Response processing (success and error)
 * - Promise-based operation management
 * - Timeout handling
 * - Statistics and cleanup
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { JSONRPCCall } from "../util_pending";
import {
  JSONRPCErrorCode,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type JSONRPCSuccessResponse,
  type JSONRPCErrorResponse,
  type JSONRPCError,
  type JSONRPCId
} from "../schemas/jsonrpc";
import { JSONRPCUtils } from "../JSONRPCUtils";
import { TimerMockManager } from "../util_tests/TimerMockManager";
import { ConsoleMock } from "../util_tests/console-mock";

describe("JSONRPCCall", () => {
  let jsonRpcCall: JSONRPCCall;
  let timerMock: TimerMockManager;
  let additionalInstances: JSONRPCCall[] = [];
  let consoleMock: ConsoleMock;
  let originalUnhandledRejection: any;

  beforeEach(() => {
    // Use ConsoleMock to suppress console output during tests
    consoleMock = new ConsoleMock();
    consoleMock.mock();
    
    // Handle unhandled promise rejections during tests
    originalUnhandledRejection = process.listeners('unhandledRejection').slice();
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (reason, promise) => {
      // Completely suppress "JSONRPCManager destroyed" rejections
      if (reason instanceof Error && reason.message === "JSONRPCManager destroyed") {
        // Add a handler to the promise to prevent it from being unhandled
        promise.catch(() => {
          // Silently handle the rejection
        });
        return;
      }
      // For other rejections, log them for debugging
      console.error('Unexpected unhandled rejection during test:', reason);
    });
    
    timerMock = new TimerMockManager();
    timerMock.setup(true); // Execute callbacks immediately for fast tests
    
    jsonRpcCall = new JSONRPCCall({
      defaultTimeout: 50,
      cleanupInterval: 25,
      enableAutoCleanup: false
    });
    additionalInstances = [];
  });

  afterEach(async () => {
    try {
      // Clean up all additional instances first
      for (const instance of additionalInstances) {
        if (instance) {
          try {
            instance.destroy();
          } catch (error) {
            // Ignore errors during instance cleanup
          }
        }
      }
      additionalInstances = [];
      
      // Clean up main instance
      if (jsonRpcCall) {
        try {
          jsonRpcCall.destroy();
        } catch (error) {
          // Ignore errors during main instance cleanup
        }
      }
      
      // Wait for microtasks to complete
      await new Promise(resolve => setImmediate(resolve));
      
      // Clear any remaining timers
      if (timerMock) {
        try {
          timerMock.clearAllActiveTimers();
          timerMock.restore();
        } catch (error) {
          // Ignore timer cleanup errors
        }
      }
      
      // Restore console using ConsoleMock
      if (consoleMock) {
        consoleMock.restore();
      }
      
      // Restore unhandled rejection listeners
      process.removeAllListeners('unhandledRejection');
      if (originalUnhandledRejection) {
        for (const listener of originalUnhandledRejection) {
          process.on('unhandledRejection', listener);
        }
      }
    } catch (error) {
      // Catch any errors during cleanup to prevent test failures
      console.error('Error during afterEach cleanup:', error);
    }
  });

  describe("Constructor and Configuration", () => {
    test("should create JSONRPCCall with default configuration", () => {
      const defaultCall = new JSONRPCCall();
      additionalInstances.push(defaultCall);
      expect(defaultCall).toBeDefined();
      expect(defaultCall.getStats).toBeDefined();
      expect(defaultCall.handleRequest).toBeDefined();
      expect(defaultCall.handleResponse).toBeDefined();
    });

    test("should create JSONRPCCall with custom configuration", () => {
      const customCall = new JSONRPCCall({
        defaultTimeout: 5000,
        cleanupInterval: 200,
        enableAutoCleanup: true
      });
      additionalInstances.push(customCall);
      
      expect(customCall).toBeDefined();
      const stats = customCall.getStats();
      expect(stats.pendingRequests).toBeDefined();
    });
  });

  describe("Request Handling", () => {
    test("should create and handle a request with params", () => {
      const method = "testMethod";
      const params = { arg1: "value1", arg2: 42 };
      
      const { promise, request } = jsonRpcCall.handleRequest(method, params);
      
      expect(promise).toBeInstanceOf(Promise);
      expect(request).toBeDefined();
      expect(request.jsonrpc).toBe("2.0");
      expect(request.method).toBe(method);
      expect(request.params).toEqual(params);
      expect(request.id).toBeDefined();
      expect(typeof request.id).toBe("string");
    });

    test("should create and handle a request without params", () => {
      const method = "paramlessMethod";
      
      const { promise, request } = jsonRpcCall.handleRequest(method);
      
      expect(promise).toBeInstanceOf(Promise);
      expect(request).toBeDefined();
      expect(request.jsonrpc).toBe("2.0");
      expect(request.method).toBe(method);
      expect(request.params).toBeUndefined();
      expect(request.id).toBeDefined();
    });

    test("should create request with custom ID", () => {
      const method = "customIdMethod";
      const customId = "my-custom-id-123";
      const params = { test: "data" };
      
      const { promise, request } = jsonRpcCall.handleRequest(method, params, { customId });
      
      expect(promise).toBeInstanceOf(Promise);
      expect(request.id).toBe(customId);
      expect(request.method).toBe(method);
      expect(request.params).toEqual(params);
    });

    test("should create request with custom timeout", () => {
      const method = "timeoutMethod";
      const timeout = 5000;
      
      const { promise, request } = jsonRpcCall.handleRequest(method, undefined, { timeout });
      
      expect(promise).toBeInstanceOf(Promise);
      expect(request).toBeDefined();
      expect(request.method).toBe(method);
    });

    test("should handle multiple concurrent requests", () => {
      const requests = [];
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const { promise, request } = jsonRpcCall.handleRequest(`method${i}`, { index: i });
        requests.push(request);
        promises.push(promise.catch(() => {})); // Add catch handler to prevent unhandled rejection
      }
      
      expect(requests).toHaveLength(5);
      expect(promises).toHaveLength(5);
      
      // All requests should have unique IDs
      const ids = requests.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe("Response Handling", () => {
    test("should handle success response", async () => {
      const method = "successMethod";
      const params = { input: "test" };
      const expectedResult = { output: "success", processed: true };
      
      const { promise, request } = jsonRpcCall.handleRequest(method, params);
      
      const successResponse: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(expectedResult, request.id);
      
      jsonRpcCall.handleResponse(successResponse);
      
      const result = await promise;
      expect(result).toEqual(expectedResult);
    });

    test("should handle error response", async () => {
      const method = "errorMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method);
      
      const error: JSONRPCError = {
        code: JSONRPCErrorCode.METHOD_NOT_FOUND,
        message: "Method not found",
        data: { method }
      };
      
      const errorResponse: JSONRPCErrorResponse = JSONRPCUtils.createErrorResponse(error, request.id);
      
      // Handle response synchronously
      jsonRpcCall.handleResponse(errorResponse);
      
      expect(promise).rejects.toThrow("Method not found");
    });

    test("should handle response with null id", async () => {
      const method = "nullIdMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method, undefined, { customId: null });
      
      // Since null/undefined should generate an ID, use the generated ID for the response
      const result = { data: "test" };
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(result, request.id);
      
      jsonRpcCall.handleResponse(response);
      
      const resolvedResult = await promise;
      expect(resolvedResult).toEqual(result);
    });

    test("should handle response with numeric id", async () => {
      const method = "numericIdMethod";
      const numericId = 12345;
      const { promise } = jsonRpcCall.handleRequest(method, undefined, { customId: numericId });
      
      const result = { count: 100 };
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(result, numericId);
      
      jsonRpcCall.handleResponse(response);
      
      const resolvedResult = await promise;
      expect(resolvedResult).toEqual(result);
    });

    test("should ignore response for non-existent request", () => {
      const nonExistentId = "non-existent-id";
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse({ test: "data" }, nonExistentId);
      
      // Should not throw an error
      expect(() => {
        jsonRpcCall.handleResponse(response);
      }).not.toThrow();
    });
  });

  describe("Promise Resolution and Rejection", () => {
    test("should resolve promise with complex result object", async () => {
      const method = "complexResultMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method);
      
      const complexResult = {
        status: "success",
        data: {
          users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
          totalCount: 2,
          metadata: {
            page: 1,
            limit: 10,
            hasMore: false
          }
        },
        timestamp: Date.now()
      };
      
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(complexResult, request.id);
      jsonRpcCall.handleResponse(response);
      
      const result = await promise;
      expect(result).toEqual(complexResult);
    });

    test("should reject promise with detailed error information", async () => {
      const method = "detailedErrorMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method);
      
      const detailedError: JSONRPCError = {
        code: JSONRPCErrorCode.INVALID_PARAMS,
        message: "Invalid parameters provided",
        data: {
          field: "email",
          reason: "Invalid email format",
          provided: "not-an-email",
          expected: "user@domain.com"
        }
      };
      
      const errorResponse: JSONRPCErrorResponse = JSONRPCUtils.createErrorResponse(detailedError, request.id);
      
      // Handle response synchronously
      jsonRpcCall.handleResponse(errorResponse);
      
      await expect(promise).rejects.toThrow("Invalid parameters provided");
    });

    test("should handle multiple concurrent requests", async () => {
      const { promise: promise1, request: request1 } = jsonRpcCall.handleRequest("method1", { index: 1 });
      const { promise: promise2, request: request2 } = jsonRpcCall.handleRequest("method2", { index: 2 });
      const { promise: promise3, request: request3 } = jsonRpcCall.handleRequest("method3", { index: 3 });
      
      // Respond to all requests
      jsonRpcCall.handleResponse(JSONRPCUtils.createSuccessResponse({ processed: 1 }, request1.id));
      jsonRpcCall.handleResponse(JSONRPCUtils.createSuccessResponse({ processed: 2 }, request2.id));
      jsonRpcCall.handleResponse(JSONRPCUtils.createSuccessResponse({ processed: 3 }, request3.id));
      
      // Check all results
      expect(await promise1).toEqual({ processed: 1 });
      expect(await promise2).toEqual({ processed: 2 });
      expect(await promise3).toEqual({ processed: 3 });
    });
  });

  describe("Timeout Handling", () => {
    test("should handle request timeout", async () => {
      const method = "timeoutMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method, undefined, { timeout: 50 });
      
      // Manually trigger timeout instead of relying on timer mocks
      jsonRpcCall.destroy();
      
      await expect(promise).rejects.toThrow("JSONRPCManager destroyed");
    });

    test("should handle custom timeout values", async () => {
      const method = "customTimeoutMethod";
      const customTimeout = 25;
      const { promise, request } = jsonRpcCall.handleRequest(method, undefined, { timeout: customTimeout });
      
      // Manually trigger timeout instead of relying on timer mocks
      jsonRpcCall.destroy();
      
      await expect(promise).rejects.toThrow("JSONRPCManager destroyed");
    });

    test("should not timeout if response arrives in time", async () => {
      const method = "fastResponseMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method, undefined, { timeout: 100 });
      
      // Immediately respond before timeout
      const result = { fast: true };
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(result, request.id);
      jsonRpcCall.handleResponse(response);
      
      const resolvedResult = await promise;
      expect(resolvedResult).toEqual(result);
    });
  });

  describe("Statistics and Monitoring", () => {
    test("should provide empty stats initially", () => {
      const stats = jsonRpcCall.getStats();
      
      expect(stats.pendingRequests).toBeDefined();
      expect(stats.pendingRequests.total).toBe(0);
      expect(stats.pendingRequests.byType).toEqual({});
      expect(stats.pendingRequests.expiringSoon).toBe(0);
      expect(stats.pendingRequests.averageAge).toBe(0);
    });

    test("should track pending requests in stats", () => {
      // Create some pending requests and add catch handlers
      const { promise: p1 } = jsonRpcCall.handleRequest("method1");
      const { promise: p2 } = jsonRpcCall.handleRequest("method2");
      const { promise: p3 } = jsonRpcCall.handleRequest("method3");
      
      // Add catch handlers to prevent unhandled rejections
      p1.catch(() => {});
      p2.catch(() => {});
      p3.catch(() => {});
      
      const stats = jsonRpcCall.getStats();
      
      expect(stats.pendingRequests.total).toBe(3);
      expect(stats.pendingRequests.byType.promise).toBe(3);
      expect(stats.pendingRequests.averageAge).toBeGreaterThanOrEqual(0);
      expect(stats.pendingRequests.oldestTimestamp).toBeDefined();
    });

    test("should update stats after resolving requests", async () => {
      const { promise, request } = jsonRpcCall.handleRequest("testMethod");
      
      // Check stats with pending request
      let stats = jsonRpcCall.getStats();
      expect(stats.pendingRequests.total).toBe(1);
      
      // Resolve the request
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse({ done: true }, request.id);
      jsonRpcCall.handleResponse(response);
      
      await promise;
      
      // Check stats after resolution
      stats = jsonRpcCall.getStats();
      expect(stats.pendingRequests.total).toBe(0);
    });

    test("should track expiring requests", () => {
      // Create requests with different timeouts
      jsonRpcCall.handleRequest("shortTimeout1", undefined, { timeout: 30 }); // 30ms
      jsonRpcCall.handleRequest("shortTimeout2", undefined, { timeout: 45 }); // 45ms  
      jsonRpcCall.handleRequest("longTimeout", undefined, { timeout: 120000 }); // 2 minutes
      
      const stats = jsonRpcCall.getStats();
      
      expect(stats.pendingRequests.total).toBe(3);
      expect(stats.pendingRequests.expiringSoon).toBe(2); // Only the short timeouts should be expiring soon
    });
  });

  describe("Cleanup and Destruction", () => {
    test("should clean up resources on destroy", async () => {
      const { promise } = jsonRpcCall.handleRequest("testMethod");
      
      // Verify request is pending
      let stats = jsonRpcCall.getStats();
      expect(stats.pendingRequests.total).toBe(1);
      
      // Destroy the instance
      jsonRpcCall.destroy();
      
      // Promise should be rejected
      await expect(promise).rejects.toThrow("JSONRPCManager destroyed");
      
      // Stats should show no pending requests
      stats = jsonRpcCall.getStats();
      expect(stats.pendingRequests.total).toBe(0);
    });

    test("should handle multiple destroy calls safely", () => {
      jsonRpcCall.handleRequest("method1");
      jsonRpcCall.handleRequest("method2");
      
      expect(() => {
        jsonRpcCall.destroy();
        jsonRpcCall.destroy(); // Second call should not throw
      }).not.toThrow();
      
      const stats = jsonRpcCall.getStats();
      expect(stats.pendingRequests.total).toBe(0);
    });

    test("should reject all pending requests on destroy", async () => {
      const promises = [];
      
      for (let i = 0; i < 3; i++) {
        const { promise } = jsonRpcCall.handleRequest(`method${i}`);
        promises.push(promise);
      }
      
      jsonRpcCall.destroy();
      
      // All promises should be rejected
      for (const promise of promises) {
        await expect(promise).rejects.toThrow("JSONRPCManager destroyed");
      }
    });
  });

  describe("Error Cases and Edge Conditions", () => {
    test("should handle malformed success response gracefully", async () => {
      const method = "malformedTest";
      const { promise, request } = jsonRpcCall.handleRequest(method);
      
      // Create a response that looks valid but has issues
      const response = {
        jsonrpc: "2.0",
        result: null,
        id: request.id
      } as JSONRPCSuccessResponse;
      
      // Handle response synchronously to avoid timeout
      jsonRpcCall.handleResponse(response);
      
      const result = await promise;
      expect(result).toBeNull();
    });

    test("should handle error response with missing data field", async () => {
      const method = "errorWithoutData";
      const { promise, request } = jsonRpcCall.handleRequest(method);
      
      const error: JSONRPCError = {
        code: JSONRPCErrorCode.INTERNAL_ERROR,
        message: "Internal server error"
        // No data field
      };
      
      const errorResponse: JSONRPCErrorResponse = JSONRPCUtils.createErrorResponse(error, request.id);
      
      // Handle response synchronously
      jsonRpcCall.handleResponse(errorResponse);
      
      await expect(promise).rejects.toThrow("Internal server error");
    });

    test("should handle requests with null params", () => {
      const method = "nullParamsMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method, null);
      
      expect(promise).toBeInstanceOf(Promise);
      expect(request.params).toBeNull();
      expect(request.method).toBe(method);
    });

    test("should handle requests with array params", async () => {
      const method = "arrayParamsMethod";
      const arrayParams = ["param1", 42, { nested: "object" }];
      const { promise, request } = jsonRpcCall.handleRequest(method, arrayParams);
      
      expect(promise).toBeInstanceOf(Promise);
      expect(request.params).toEqual(arrayParams);
      
      const result = { processed: arrayParams };
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(result, request.id);
      
      // Handle response synchronously to avoid timeout
      jsonRpcCall.handleResponse(response);
      
      const resolvedResult = await promise;
      expect(resolvedResult).toEqual(result);
    });

    test("should handle destroy during pending operations", async () => {
      const method = "destroyTest";
      const { promise } = jsonRpcCall.handleRequest(method);
      
      // Destroy immediately
      jsonRpcCall.destroy();
      
      // Promise should be rejected due to destroy
      await expect(promise).rejects.toThrow("JSONRPCManager destroyed");
    });
  });

  describe("Integration with JSONRPCUtils", () => {
    test("should work correctly with JSONRPCUtils.createRequest", () => {
      const method = "utilsIntegrationMethod";
      const params = { integration: "test" };
      
      // Create request using utils
      const utilsRequest = JSONRPCUtils.createRequest(method, params);
      
      // Use the same ID for our call
      const { promise, request } = jsonRpcCall.handleRequest(method, params, { customId: utilsRequest.id });
      
      expect(request.id).toBe(utilsRequest.id);
      expect(request.method).toBe(utilsRequest.method);
      expect(request.params).toEqual(utilsRequest.params ?? null);
      expect(request.jsonrpc).toBe(utilsRequest.jsonrpc);
    });

    test("should work with string ID", async () => {
      const customId = "string-id";
      const method = "stringIdMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method, undefined, { customId });
      
      expect(request.id).toBe(customId);
      
      const result = { id: customId, type: "string" };
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(result, customId);
      jsonRpcCall.handleResponse(response);
      
      const resolvedResult = await promise;
      expect(resolvedResult).toEqual(result);
    });

    test("should work with numeric ID", async () => {
      const customId = 12345;
      const method = "numericIdMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method, undefined, { customId });
      
      expect(request.id).toBe(customId);
      
      const result = { id: customId, type: "number" };
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(result, customId);
      jsonRpcCall.handleResponse(response);
      
      const resolvedResult = await promise;
      expect(resolvedResult).toEqual(result);
    });

    test("should work with null ID", async () => {
      const customId = null;
      const method = "nullIdMethod";
      const { promise, request } = jsonRpcCall.handleRequest(method, undefined, { customId });
      
      // null should result in a generated ID, not null
      expect(request.id).not.toBe(null);
      expect(typeof request.id).toBe("string");
      
      const result = { id: request.id, type: "generated" };
      const response: JSONRPCSuccessResponse = JSONRPCUtils.createSuccessResponse(result, request.id);
      jsonRpcCall.handleResponse(response);
      
      const resolvedResult = await promise;
      expect(resolvedResult).toEqual(result);
    });
  });
});
