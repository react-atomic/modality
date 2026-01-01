import { mock } from "bun:test";

/**
 * Centralized mock utilities for ModalityClient testing
 * Provides reusable mocks with easy configuration and cleanup
 */

// Base mock client interface
export interface MockModalityClient {
  call: ReturnType<typeof mock>;
  callOnce: ReturnType<typeof mock>;
  callStream: ReturnType<typeof mock>;
  listTools: ReturnType<typeof mock>;
  close: ReturnType<typeof mock>;
  parseContent?: ReturnType<typeof mock>;
}

// Mock factory configuration
export interface MockClientConfig {
  shouldThrow?: boolean;
  throwMessage?: string;
  defaultResponses?: {
    call?: any;
    callOnce?: any;
    callStream?: any;
    listTools?: any;
  };
}

/**
 * Creates a mock ModalityClient with configurable behavior
 */
export function createMockModalityClient(config: MockClientConfig = {}): MockModalityClient {
  const mockClient: MockModalityClient = {
    call: mock(),
    callOnce: mock(),
    callStream: mock(),
    listTools: mock(),
    close: mock(),
    parseContent: mock(),
  };

  // Set default responses if provided
  if (config.defaultResponses?.call) {
    mockClient.call.mockResolvedValue(config.defaultResponses.call);
  }
  if (config.defaultResponses?.callOnce) {
    mockClient.callOnce.mockResolvedValue(config.defaultResponses.callOnce);
  }
  if (config.defaultResponses?.callStream) {
    mockClient.callStream.mockReturnValue(config.defaultResponses.callStream);
  }
  if (config.defaultResponses?.listTools) {
    mockClient.listTools.mockResolvedValue(config.defaultResponses.listTools);
  }

  // close() should always resolve successfully
  mockClient.close.mockResolvedValue(undefined);

  // Configure throwing behavior
  if (config.shouldThrow) {
    const error = new Error(config.throwMessage || "Mock error");
    mockClient.call.mockRejectedValue(error);
    mockClient.callOnce.mockRejectedValue(error);
    mockClient.callStream.mockImplementation(() => {
      throw error;
    });
    mockClient.listTools.mockRejectedValue(error);
  }

  return mockClient;
}

/**
 * Creates mock factory functions for the ModalityClient namespace
 */
export function createMockModalityClientFactories(
  httpConfig: MockClientConfig = {},
  stdioConfig: MockClientConfig = {},
  sseConfig: MockClientConfig = {}
) {
  return {
    http: mock(() => createMockModalityClient(httpConfig)),
    stdio: mock(() => createMockModalityClient(stdioConfig)),
    sse: mock(() => createMockModalityClient(sseConfig)),
  };
}

/**
 * Utility to reset all mocks in a MockModalityClient
 */
export function resetMockModalityClient(mockClient: MockModalityClient): void {
  mockClient.call.mockReset();
  mockClient.callOnce.mockReset();
  mockClient.callStream.mockReset();
  mockClient.listTools.mockReset();
  mockClient.close.mockReset();
  if (mockClient.parseContent) {
    mockClient.parseContent.mockReset();
  }
}

/**
 * Utility to reset all factory mocks
 */
export function resetMockFactories(factories: ReturnType<typeof createMockModalityClientFactories>): void {
  factories.http.mockReset();
  factories.stdio.mockReset();
  factories.sse.mockReset();
}

/**
 * Creates a complete mock module for ModalityClient
 */
export function createModalityClientMockModule(config: {
  http?: MockClientConfig;
  stdio?: MockClientConfig;
  sse?: MockClientConfig;
} = {}) {
  const factories = createMockModalityClientFactories(
    config.http,
    config.stdio,
    config.sse
  );

  return {
    ModalityClient: factories,
    // Export the factories for direct access in tests
    __testFactories: factories,
  };
}

/**
 * Default successful responses for common test scenarios
 */
export const DEFAULT_RESPONSES = {
  SUCCESS: {
    call: { content: { message: "success" } },
    callOnce: { content: { message: "success" } },
    callStream: new ReadableStream({
      start(controller) {
        controller.enqueue("stream data");
        controller.close();
      },
    }),
  },
  ERROR: {
    shouldThrow: true,
    throwMessage: "Mock client error",
  },
} as const;

/**
 * Pre-configured mock scenarios for common test cases
 */
export const MOCK_SCENARIOS = {
  /**
   * Normal working client that returns successful responses
   */
  WORKING_CLIENT: () => createMockModalityClient({
    defaultResponses: DEFAULT_RESPONSES.SUCCESS,
  }),

  /**
   * Client that throws errors on all operations
   */
  ERROR_CLIENT: () => createMockModalityClient(DEFAULT_RESPONSES.ERROR),

  /**
   * Client with custom responses
   */
  CUSTOM_CLIENT: (responses: MockClientConfig['defaultResponses']) => 
    createMockModalityClient({ defaultResponses: responses }),
} as const;