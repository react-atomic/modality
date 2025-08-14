import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { WebSocketClient } from "../websocket-client";
import type { JSONRPCValidationResult } from "../schemas/jsonrpc";

// Mock the logger to suppress output during tests
mock.module("../util_logger", () => ({
  getLoggerInstance: () => ({
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
  }),
}));

// Mock JSONRPCUtils to avoid actual validation logic
mock.module("../schemas/jsonrpc", () => ({
  JSONRPCUtils: {
    deserialize: (data: string) => JSON.parse(data),
    validateMessage: (message: any) => ({
      valid: true,
      message,
      error: null,
    }),
  },
}));

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (event: any) => void = () => {};
  onclose: (event: any) => void = () => {};
  onmessage: (event: any) => void = () => {};
  onerror: (event: any) => void = () => {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = mock((_data: string) => {});
  close = mock((code?: number, reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose({ code, reason });
  });

  // --- Helper methods for testing ---
  _open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen({});
  }

  _message(data: any) {
    this.onmessage({ data: JSON.stringify(data) });
  }

  _error() {
    this.onerror({});
  }

  static getMostRecentInstance(): MockWebSocket | undefined {
    return this.instances[this.instances.length - 1];
  }

  static clearInstances() {
    this.instances = [];
  }
}

// @ts-ignore
global.WebSocket = MockWebSocket;

describe("WebSocketClient", () => {
  const testUrl = "ws://localhost:8080";
  const defaultConfig = {
    maxReconnectAttempts: 10,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 30000,
    lastReconnectDelay: 300000,
    callTimeout: 5000,
    heartbeatInterval: 30000,
    enableKeepAlive: true,
    handleMessage: (
      _validMessage: JSONRPCValidationResult,
      _ws: WebSocketClient
    ) => {},
  };

  beforeEach(() => {
    MockWebSocket.clearInstances();
  });

  describe("constructor", () => {
    it("should throw an error for an invalid WebSocket URL", () => {
      expect(() => new WebSocketClient("http://invalid.com")).toThrow(
        "Invalid WebSocket URL: http://invalid.com. Must use ws:// or wss:// protocol."
      );
    });

    it("should not throw for a valid ws:// URL", () => {
      expect(() => new WebSocketClient("ws://valid.com")).not.toThrow();
    });

    it("should not throw for a valid wss:// URL", () => {
      expect(() => new WebSocketClient("wss://valid.com")).not.toThrow();
    });

    it("should correctly apply custom configuration", () => {
      const config = {
        ...defaultConfig,
        maxReconnectAttempts: 5,
        callTimeout: 10000,
      };
      const client = new WebSocketClient(testUrl, config);
      // @ts-ignore - accessing private config for testing
      expect(client.config.maxReconnectAttempts).toBe(5);
      // @ts-ignore
      expect(client.config.callTimeout).toBe(10000);
    });
  });

  describe("connection", () => {
    it("should create a WebSocket instance on connect", () => {
      const client = new WebSocketClient(testUrl);
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      expect(wsInstance).toBeDefined();
      expect(wsInstance?.url).toBe(testUrl);
    });

    it("should set isManualDisconnect to true and close the connection on disconnect", () => {
      const client = new WebSocketClient(testUrl);
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();

      client.disconnect();

      // @ts-ignore
      expect(client.isManualDisconnect).toBe(true);
      expect(wsInstance?.close).toHaveBeenCalledWith(1000, "Manual disconnect");
    });

    it("should be connected after the onopen event", () => {
      const client = new WebSocketClient(testUrl);
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();

      expect(client.isConnected()).toBe(false);
      wsInstance?._open();
      expect(client.isConnected()).toBe(true);
    });
  });

  describe("messaging", () => {
    it("should send a message when connected", async () => {
      const client = new WebSocketClient(testUrl);
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      wsInstance?._open();

      const data = { method: "test" };
      const sent = await client.send(data);

      expect(sent).toBe(true);
      expect(wsInstance?.send).toHaveBeenCalled();
      if (wsInstance?.send) {
        const sentMessage = JSON.parse(wsInstance.send.mock.calls[0][0]);
        expect(sentMessage.method).toBe("test");
        expect(sentMessage.jsonrpc).toBe("2.0");
      }
    });

    it("should not send a message when not connected", async () => {
      const client = new WebSocketClient(testUrl);

      const sent = await client.send({ method: "test" });

      expect(sent).toBe(false);
    });

    it("should handle server.connected message", () => {
      const client = new WebSocketClient(testUrl);
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      wsInstance?._open();

      const connectionId = 12345;
      wsInstance?._message({
        method: "server.connected",
        params: { connectionId },
      });

      expect(client.getInfo().connectionId).toBe(connectionId);
    });

    it("should call the custom handleMessage for other messages", () => {
      const handleMessage = mock((_validMessage, _ws) => {});
      const client = new WebSocketClient(testUrl, {
        ...defaultConfig,
        handleMessage,
      });
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      wsInstance?._open();

      const message = { id: 1, result: "success" };
      wsInstance?._message(message);

      expect(handleMessage).toHaveBeenCalled();
      const receivedMsg = handleMessage.mock.calls[0][0];
      expect(receivedMsg.valid).toBe(true);
      expect(receivedMsg.message.id).toBe(1);
    });
  });

  describe("WebSocketStream functionality", () => {
    let mockStreamWriter: any;
    let mockWebSocketStream: any;

    beforeEach(() => {
      mockStreamWriter = {
        write: mock().mockResolvedValue(undefined),
        close: mock(),
        abort: mock(),
      };

      mockWebSocketStream = {
        opened: Promise.resolve({
          readable: new ReadableStream(),
          writable: {
            getWriter: mock().mockReturnValue(mockStreamWriter),
          },
        }),
        closed: Promise.resolve(),
        close: mock(),
      };

      (global as any).WebSocketStream = mock().mockImplementation(
        () => mockWebSocketStream
      );
    });

    afterEach(() => {
      delete (global as any).WebSocketStream;
    });

    it("should send message via WebSocketStream when useStream is true", async () => {
      const client = new WebSocketClient(testUrl);
      const data = { method: "test" };

      const sent = await client.send(data, true);

      expect(sent).toBe(true);
      expect(mockStreamWriter.write).toHaveBeenCalledWith(
        expect.stringContaining('"method":"test"')
      );
      expect(mockStreamWriter.write).toHaveBeenCalledWith(
        expect.stringContaining('"jsonrpc":"2.0"')
      );
    });

    it("should initialize WebSocketStream lazily on first use", async () => {
      const client = new WebSocketClient(testUrl);

      expect((global as any).WebSocketStream).not.toHaveBeenCalled();

      await client.send({ method: "test" }, true);

      expect((global as any).WebSocketStream).toHaveBeenCalledWith(testUrl);
    });

    it("should reuse existing WebSocketStream writer for subsequent calls", async () => {
      const client = new WebSocketClient(testUrl);

      await client.send({ method: "test1" }, true);
      await client.send({ method: "test2" }, true);

      expect((global as any).WebSocketStream).toHaveBeenCalledTimes(1);
      expect(mockStreamWriter.write).toHaveBeenCalledTimes(2);
    });

    it("should fall back gracefully when WebSocketStream is not supported", async () => {
      delete (global as any).WebSocketStream;
      const client = new WebSocketClient(testUrl);

      const sent = await client.send({ method: "test" }, true);

      expect(sent).toBe(false);
    });

    it("should handle WebSocketStream initialization errors", async () => {
      const mockError = new Error("Stream initialization failed");
      (global as any).WebSocketStream = mock().mockImplementation(() => {
        throw mockError;
      });

      const client = new WebSocketClient(testUrl);

      const sent = await client.send({ method: "test" }, true);

      expect(sent).toBe(false);
    });

    it("should handle WebSocketStream write errors", async () => {
      const writeError = new Error("Write failed");
      mockStreamWriter.write.mockRejectedValue(writeError);

      const client = new WebSocketClient(testUrl);

      const sent = await client.send({ method: "test" }, true);

      expect(sent).toBe(false);
    });

    it("should use traditional WebSocket when useStream is false", async () => {
      const client = new WebSocketClient(testUrl);
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      wsInstance?._open();

      const sent = await client.send({ method: "test" }, false);

      expect(sent).toBe(true);
      expect(wsInstance?.send).toHaveBeenCalled();
      expect((global as any).WebSocketStream).not.toHaveBeenCalled();
    });
  });

  describe("reconnection", () => {
    it("should attempt to reconnect on close if not manual", async () => {
      const client = new WebSocketClient(testUrl, {
        ...defaultConfig,
        initialReconnectDelay: 1,
      });
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();

      const attemptReconnectSpy = spyOn(client as any, "attemptReconnect");

      wsInstance?.close();

      expect(attemptReconnectSpy).toHaveBeenCalled();
    });

    it("should not attempt to reconnect on manual disconnect", () => {
      const client = new WebSocketClient(testUrl);
      client.connect();
      const attemptReconnectSpy = spyOn(client as any, "attemptReconnect");

      client.disconnect();

      expect(attemptReconnectSpy).not.toHaveBeenCalled();
    });
  });

  describe("heartbeat", () => {
    it("should start heartbeat on connect if enabled", () => {
      const client = new WebSocketClient(testUrl, {
        ...defaultConfig,
        enableKeepAlive: true,
      });
      const startHeartbeatSpy = spyOn(client as any, "startHeartbeat");
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      wsInstance?._open();
      expect(startHeartbeatSpy).toHaveBeenCalled();
    });

    it("should not start heartbeat if disabled", () => {
      const client = new WebSocketClient(testUrl, {
        ...defaultConfig,
        enableKeepAlive: false,
      });
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      wsInstance?._open();
      // @ts-ignore - accessing private member
      expect(client.heartbeatInterval).toBeNull();
    });

    it("should send ping on heartbeat interval", async () => {
      const client = new WebSocketClient(testUrl, {
        ...defaultConfig,
        heartbeatInterval: 10,
      });
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      wsInstance?._open();

      await Bun.sleep(15);
      expect(wsInstance?.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"ping"')
      );

      await Bun.sleep(10);
      expect(wsInstance?.send).toHaveBeenCalledTimes(2);
    });

    it("should stop heartbeat on disconnect", () => {
      const client = new WebSocketClient(testUrl);
      const stopHeartbeatSpy = spyOn(client as any, "stopHeartbeat");
      client.connect();
      const wsInstance = MockWebSocket.getMostRecentInstance();
      wsInstance?._open();

      client.disconnect();
      // startHeartbeat (which calls stopHeartbeat), disconnect, and onclose
      expect(stopHeartbeatSpy).toHaveBeenCalledTimes(3);
    });
  });
});
