import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
  mock,
  type Mock,
} from "bun:test";
import { JSONRPCErrorCode, STANDARD_ERROR_MESSAGES } from "../schemas/jsonrpc";
import type { JSONRPCMessage } from "../schemas/jsonrpc";
import { JSONRPCUtils } from "../JSONRPCUtils";
import type {
  JSONRPCManagerConfig,
  JSONRPCManagerEvents,
} from "../jsonrpc-manager";
import { JSONRPCManager } from "../jsonrpc-manager";

// Mock context for tests
type TestContext = {
  userId?: string;
  requestId?: string;
};

// Enhanced mock types for better TypeScript safety
type MockedSendMessage = Mock<(message: any, context: TestContext) => void>;
type MockedMethodHandler = Mock<(params: any, context: TestContext) => any>;
type MockedEventHandler = Mock<(...args: any[]) => void>;

// Mock factories for consistent test setup
class MockFactory {
  static createSendMessageMock(): MockedSendMessage {
    return mock(() => {}) as MockedSendMessage;
  }

  static createMethodHandler(returnValue: any = "mocked"): MockedMethodHandler {
    return mock(() => returnValue) as MockedMethodHandler;
  }

  static createAsyncMethodHandler(
    returnValue: any = "mocked"
  ): MockedMethodHandler {
    return mock(() => Promise.resolve(returnValue)) as MockedMethodHandler;
  }

  static createErrorMethodHandler(
    errorMessage: string = "Mock error"
  ): MockedMethodHandler {
    return mock(() => {
      throw new Error(errorMessage);
    }) as MockedMethodHandler;
  }

  static createEventHandler(): MockedEventHandler {
    return mock(() => {}) as MockedEventHandler;
  }

  // Advanced mock utilities for complex scenarios
  static createDelayedHandler(
    returnValue: any = "delayed",
    delayMs: number = 100
  ): MockedMethodHandler {
    return mock(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(returnValue), delayMs)
        )
    ) as MockedMethodHandler;
  }

  static createCallCountTracker(): {
    handler: MockedMethodHandler;
    getCallCount: () => number;
  } {
    let callCount = 0;
    const handler = mock(() => {
      callCount++;
      return `call-${callCount}`;
    }) as MockedMethodHandler;

    return {
      handler,
      getCallCount: () => callCount,
    };
  }

  static createParameterCapture<T = any>(): {
    handler: MockedMethodHandler;
    getCapturedParams: () => T[];
  } {
    const capturedParams: T[] = [];
    const handler = mock((params: T) => {
      capturedParams.push(params);
      return "captured";
    }) as MockedMethodHandler;

    return {
      handler,
      getCapturedParams: () => [...capturedParams],
    };
  }
}

// Concrete test implementation of abstract JSONRPCManager
class TestJSONRPCManager extends JSONRPCManager<TestContext> {
  protected sendMessage(message: JSONRPCMessage, options?: TestContext): any {
    // Mock implementation for testing
    return Promise.resolve();
  }
}

describe("JSONRPCManager", () => {
  let manager: JSONRPCManager<TestContext>;
  let sendMessageSpy: MockedSendMessage;

  // Enhanced manager factory with typed mocks
  const createManager = (
    config: JSONRPCManagerConfig<TestContext> = {},
    events: JSONRPCManagerEvents<TestContext> = {}
  ): JSONRPCManager<TestContext> => {
    const newManager = new TestJSONRPCManager(config, events);

    // Create typed mock for sendMessage using factory
    sendMessageSpy = MockFactory.createSendMessageMock();
    spyOn(newManager as any, "sendMessage").mockImplementation(sendMessageSpy);

    return newManager;
  };

  beforeEach(() => {
    manager = createManager();
  });

  afterEach(() => {
    if (sendMessageSpy) {
      sendMessageSpy.mockClear();
    }
    if (manager) {
      manager.destroy();
    }
  });

  describe("Constructor and Configuration", () => {
    it("should initialize with default configuration", () => {
      // @ts-expect-error - accessing private property for test
      const config = manager.config;
      expect(config.strictValidation).toBe(true);
      expect(config.defaultTimeout).toBe(30000);
      expect(config.maxBatchSize).toBe(10);
      expect(typeof config.errorHandler).toBe("function");
    });

    it("should apply custom configuration", () => {
      const customConfig: JSONRPCManagerConfig<TestContext> = {
        strictValidation: false,
        defaultTimeout: 1000,
        maxBatchSize: 5,
        errorHandler: () => JSONRPCUtils.createError(1234, "Custom Error"),
      };
      manager = createManager(customConfig);
      // @ts-expect-error - accessing private property for test
      const config = manager.config;
      expect(config.strictValidation).toBe(false);
      expect(config.defaultTimeout).toBe(1000);
      expect(config.maxBatchSize).toBe(5);
      expect(config.errorHandler(new Error()).code).toBe(1234);
    });
  });

  describe("Method Registration", () => {
    const testMethod = { handler: () => "test" };

    it("should register a new method", () => {
      manager.registerMethod("test.method", testMethod);
      expect(manager.getRegisteredMethods()).toContain("test.method");
    });

    it("should throw an error when registering a duplicate method", () => {
      manager.registerMethod("test.method", testMethod);
      expect(() => manager.registerMethod("test.method", testMethod)).toThrow(
        "Method 'test.method' is already registered"
      );
    });

    it("should unregister an existing method", () => {
      manager.registerMethod("test.method", testMethod);
      const result = manager.unregisterMethod("test.method");
      expect(result).toBe(true);
      expect(manager.getRegisteredMethods()).not.toContain("test.method");
    });

    it("should return false when unregistering a non-existent method", () => {
      const result = manager.unregisterMethod("non.existent.method");
      expect(result).toBe(false);
    });
  });

  describe("Outgoing Messages", () => {
    it("should send a request using handleRequest", () => {
      const { promise, request } = manager.handleRequest("test.method", {
        foo: "bar",
      });
      expect(promise).toBeInstanceOf(Promise);
      expect(request.method).toBe("test.method");
      expect(request.params).toEqual({ foo: "bar" });
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      expect(sendMessageSpy).toHaveBeenCalledWith(request, {});
    });

    it("should send a notification using sendNotification", () => {
      const context: TestContext = { userId: "user1" };
      (manager as any).sendNotification(
        "test.notification",
        { baz: "qux" },
        context
      );
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      const sentMessage = sendMessageSpy.mock.calls[0][0];
      expect(sentMessage.method).toBe("test.notification");
      expect(sentMessage.params).toEqual({ baz: "qux" });
      expect(sentMessage.id).toBeUndefined();
      expect(sendMessageSpy).toHaveBeenCalledWith(sentMessage, context);
    });
  });

  describe("Incoming Message Validation and Processing", () => {
    beforeEach(() => {
      manager.registerMethod("test.add", {
        handler: (params: { a: number; b: number }) => params.a + params.b,
      });
      manager.registerMethod("test.subtract", {
        handler: async (params: { a: number; b: number }) =>
          Promise.resolve(params.a - params.b),
      });
      manager.registerMethod("test.error", {
        handler: () => {
          throw new Error("Test error");
        },
      });
      manager.registerMethod("test.notify", {
        handler: () => {},
      });
    });

    it("should handle invalid JSON with a PARSE_ERROR", async () => {
      await manager.validateMessage("{invalid json", {});
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      const response = sendMessageSpy.mock.calls[0][0];
      expect(response.error.code).toBe(JSONRPCErrorCode.PARSE_ERROR);
      expect(response.id).toBeNull();
    });

    it("should handle invalid JSON-RPC with an INVALID_REQUEST error", async () => {
      const invalidRequest = JSON.stringify({ method: "foo", params: [] });
      await manager.validateMessage(invalidRequest, {});
      expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      const response = sendMessageSpy.mock.calls[0][0];
      expect(response.error.code).toBe(JSONRPCErrorCode.INVALID_REQUEST);
      expect(response.id).toBeNull();
    });

    describe("Request Processing", () => {
      it("should process a valid request and return a success response", async () => {
        const request = JSONRPCUtils.createRequest(
          "test.add",
          { a: 5, b: 3 },
          { customId: 1 }
        );
        await manager.validateMessage(JSON.stringify(request), {});
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        const response = sendMessageSpy.mock.calls[0][0];
        expect(response.result).toBe(8);
        expect(response.id).toBe(1);
        expect(response.error).toBeUndefined();
      });

      it("should process a valid async request and return a success response", async () => {
        const request = JSONRPCUtils.createRequest(
          "test.subtract",
          { a: 5, b: 3 },
          { customId: "req-2" }
        );
        await manager.validateMessage(JSON.stringify(request), {});
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        const response = sendMessageSpy.mock.calls[0][0];
        expect(response.result).toBe(2);
        expect(response.id).toBe("req-2");
        expect(response.error).toBeUndefined();
      });

      it("should return METHOD_NOT_FOUND for an unregistered method", async () => {
        const request = JSONRPCUtils.createRequest(
          "test.unregistered",
          {},
          { customId: 3 }
        );
        await manager.validateMessage(JSON.stringify(request), {});
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        const response = sendMessageSpy.mock.calls[0][0];
        expect(response.error.code).toBe(JSONRPCErrorCode.METHOD_NOT_FOUND);
        expect(response.id).toBe(3);
      });

      it("should return INTERNAL_ERROR when a method handler throws an error", async () => {
        const request = JSONRPCUtils.createRequest(
          "test.error",
          {},
          { customId: 4 }
        );
        await manager.validateMessage(JSON.stringify(request), {});
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        const response = sendMessageSpy.mock.calls[0][0];
        expect(response.error.code).toBe(JSONRPCErrorCode.INTERNAL_ERROR);
        expect(response.error.message).toBe("Test error");
        expect(response.error.data.errorType).toBe(
          STANDARD_ERROR_MESSAGES[JSONRPCErrorCode.INTERNAL_ERROR]
        );
        expect(response.id).toBe(4);
      });
    });

    describe("Notification Processing", () => {
      it("should process a valid notification and not send a response", async () => {
        const handlerSpy = spyOn(
          (manager as any).methods.get("test.notify")!,
          "handler"
        );
        const notification = JSONRPCUtils.createNotification("test.notify", {
          value: 1,
        });
        await manager.validateMessage(JSON.stringify(notification), {});
        expect(handlerSpy).toHaveBeenCalledTimes(1);
        expect(handlerSpy).toHaveBeenCalledWith(
          { value: 1 },
          expect.any(Object)
        );
        expect(sendMessageSpy).not.toHaveBeenCalled();
        handlerSpy.mockRestore();
      });

      it("should ignore notifications for unregistered methods", async () => {
        const notification = JSONRPCUtils.createNotification(
          "test.unregistered.notify"
        );
        await manager.validateMessage(JSON.stringify(notification), {});
        // When receiving input from outside for unregistered methods, it's OK to not handle it.
        // Unregistered notifications should be silently ignored without sending responses.
        expect(sendMessageSpy).not.toHaveBeenCalled();
      });
    });

    describe("Response Processing", () => {
      it("should handle an incoming response and resolve the pending promise", async () => {
        const { promise, request } = manager.handleRequest(
          "some.external.method",
          {}
        );
        const response = JSONRPCUtils.createSuccessResponse(
          "Success!",
          request.id
        );
        await manager.validateMessage(JSON.stringify(response), {});
        expect(promise).resolves.toBe("Success!");
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      });

      it("should handle an incoming error response and reject the pending promise", async () => {
        const { promise, request } = manager.handleRequest(
          "some.external.method",
          {}
        );
        const error = JSONRPCUtils.createError(123, "External Error");
        const response = JSONRPCUtils.createErrorResponse(error, request.id);
        await manager.validateMessage(JSON.stringify(response), {});
        expect(promise).rejects.toThrow(error.message);
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe("Batch Request Processing", () => {
      it("should process a batch of requests and return an array of responses", async () => {
        const batchRequest = [
          JSONRPCUtils.createRequest(
            "test.add",
            { a: 1, b: 2 },
            { customId: 1 }
          ),
          JSONRPCUtils.createRequest(
            "test.subtract",
            { a: 10, b: 5 },
            { customId: 2 }
          ),
        ];
        await manager.validateMessage(JSON.stringify(batchRequest), {});
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        const batchResponse = sendMessageSpy.mock.calls[0][0];
        expect(batchResponse).toBeArrayOfSize(2);
        expect(batchResponse).toContainEqual({
          jsonrpc: "2.0",
          result: 3,
          id: 1,
        });
        expect(batchResponse).toContainEqual({
          jsonrpc: "2.0",
          result: 5,
          id: 2,
        });
      });

      it("should process a mixed batch of requests and notifications", async () => {
        const batchRequest = [
          JSONRPCUtils.createRequest(
            "test.add",
            { a: 7, b: 8 },
            { customId: "batch-req-1" }
          ),
          JSONRPCUtils.createNotification("test.notify", { info: "hello" }),
          JSONRPCUtils.createRequest(
            "test.error",
            {},
            { customId: "batch-req-2" }
          ),
        ];
        await manager.validateMessage(JSON.stringify(batchRequest), {});
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        const batchResponse = sendMessageSpy.mock.calls[0][0];
        expect(batchResponse).toBeArrayOfSize(2);
        expect(batchResponse).toContainEqual({
          jsonrpc: "2.0",
          result: 15,
          id: "batch-req-1",
        });
        expect(batchResponse).toContainEqual(
          expect.objectContaining({
            id: "batch-req-2",
            error: expect.any(Object),
          })
        );
      });

      it("should not send a response for a batch of only notifications", async () => {
        const batchRequest = [
          JSONRPCUtils.createNotification("test.notify", { info: "a" }),
          JSONRPCUtils.createNotification("test.notify", { info: "b" }),
        ];
        await manager.validateMessage(JSON.stringify(batchRequest), {});
        expect(sendMessageSpy).not.toHaveBeenCalled();
      });

      it("should return an error for a batch exceeding maxBatchSize", async () => {
        const customManager = createManager({ maxBatchSize: 2 });
        const batchRequest = [
          JSONRPCUtils.createRequest(
            "test.add",
            { a: 1, b: 1 },
            { customId: 1 }
          ),
          JSONRPCUtils.createRequest(
            "test.add",
            { a: 2, b: 2 },
            { customId: 2 }
          ),
          JSONRPCUtils.createRequest(
            "test.add",
            { a: 3, b: 3 },
            { customId: 3 }
          ),
        ];
        await customManager.validateMessage(JSON.stringify(batchRequest), {});
        expect(sendMessageSpy).toHaveBeenCalledTimes(1);
        const response = sendMessageSpy.mock.calls[0][0];
        expect(response).toBeArrayOfSize(1);
        expect(response[0].error.code).toBe(JSONRPCErrorCode.INVALID_REQUEST);
        expect(response[0].error.message).toContain(
          "exceeds maximum allowed size"
        );
      });
    });
  });

  describe("Event Handlers", () => {
    let eventSpies: {
      onMethodCall: MockedEventHandler;
      onMethodResponse: MockedEventHandler;
      onMethodError: MockedEventHandler;
    };
    let onMethodCallSpy: any;
    let onMethodResponseSpy: any;
    let onMethodErrorSpy: any;

    beforeEach(() => {
      // Create typed event handler mocks using factory
      eventSpies = {
        onMethodCall: MockFactory.createEventHandler(),
        onMethodResponse: MockFactory.createEventHandler(),
        onMethodError: MockFactory.createEventHandler(),
      };

      onMethodCallSpy = spyOn(eventSpies, "onMethodCall");
      onMethodResponseSpy = spyOn(eventSpies, "onMethodResponse");
      onMethodErrorSpy = spyOn(eventSpies, "onMethodError");
    });

    it("should call onMethodCall, onMethodResponse for a successful request", async () => {
      manager = createManager({}, eventSpies);
      manager.registerMethod("test.event", { handler: () => "success" });

      const request = JSONRPCUtils.createRequest(
        "test.event",
        { p: 1 },
        { customId: 1 }
      );
      await manager.validateMessage(JSON.stringify(request), {
        userId: "user-event",
      });

      expect(onMethodCallSpy).toHaveBeenCalledTimes(1);
      expect(onMethodCallSpy).toHaveBeenCalledWith(
        "test.event",
        { p: 1 },
        expect.any(Object)
      );

      expect(onMethodResponseSpy).toHaveBeenCalledTimes(1);
      expect(onMethodResponseSpy).toHaveBeenCalledWith(
        "test.event",
        "success",
        expect.any(Object)
      );

      expect(onMethodErrorSpy).not.toHaveBeenCalled();
    });

    it("should call onMethodCall, onMethodError for a failed request", async () => {
      manager = createManager({}, eventSpies);
      manager.registerMethod("test.event.fail", {
        handler: () => {
          throw new Error("fail");
        },
      });

      const request = JSONRPCUtils.createRequest(
        "test.event.fail",
        {},
        { customId: 2 }
      );
      await manager.validateMessage(JSON.stringify(request), {});

      expect(onMethodCallSpy).toHaveBeenCalledTimes(1);
      expect(onMethodResponseSpy).not.toHaveBeenCalled();
      expect(onMethodErrorSpy).toHaveBeenCalledTimes(1);
      expect(onMethodErrorSpy).toHaveBeenCalledWith(
        "test.event.fail",
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe("Stats and Cleanup", () => {
    it("should return correct stats", () => {
      manager.registerMethod("m1", { handler: () => {} });
      manager.registerMethod("m2", { handler: () => {} });
      manager.handleRequest("outgoing", {});

      const stats = manager.getStats();
      expect(stats.registeredMethods).toBe(2);
      expect(stats.methodNames).toEqual(["m1", "m2"]);
      expect(stats.pendingRequests.total).toBe(1);
    });

    it("should clear methods and pending requests on destroy", async () => {
      manager.registerMethod("m1", { handler: () => {} });
      const { promise } = manager.handleRequest("outgoing", {});

      manager.destroy();

      expect(manager.getRegisteredMethods()).toBeEmpty();
      expect(manager.getStats().pendingRequests.total).toBe(0);
      expect(promise).rejects.toThrow("JSONRPCManager destroyed");
    });
  });
});
