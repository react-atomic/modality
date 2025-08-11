import { JSONRPCUtils } from "./schemas/jsonrpc";
import { getLoggerInstance } from "./util_logger";
import type {
  JSONRPCValidationResult,
  JSONRPCRequest,
} from "./schemas/jsonrpc";

const logger = getLoggerInstance("WebSocket-Client");

interface WebSocketConfig {
  maxReconnectAttempts: number;
  initialReconnectDelay: number;
  maxReconnectDelay: number;
  callTimeout: number;
  heartbeatInterval: number;
  enableKeepAlive: boolean;
  handleMessage: (
    validMessage: JSONRPCValidationResult,
    ws: WebSocketClient
  ) => void;
}

interface WebSocketInfo {
  url: string;
  connected: boolean;
  clientId: string;
  connectionId: number | null;
  pendingCalls?: number;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private config: WebSocketConfig = {
    initialReconnectDelay: 1000, // 1 second
    maxReconnectDelay: 30000, // 30 seconds
    maxReconnectAttempts: 10, // Maximum number of reconnect attempts
    callTimeout: 5000, // 5 seconds for call timeout
    heartbeatInterval: 30000, // 30 seconds for heartbeat
    enableKeepAlive: true, // Enable keep-alive by default
    handleMessage: (
      _validMessage: JSONRPCValidationResult,
      _ws: WebSocketClient
    ) => {}, // Optional custom message handler
  };
  private connectionId: number | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isManualDisconnect = false;
  private reconnectAttempts = 0;
  private reconnectDelay: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  constructor(url: string, config?: Record<keyof WebSocketConfig, any>) {
    if (!this.isValidWebSocketUrl(url)) {
      throw new Error(
        `Invalid WebSocket URL: ${url}. Must use ws:// or wss:// protocol.`
      );
    }
    this.config = { ...this.config, ...config };
    this.url = url;
    this.reconnectDelay = this.config.initialReconnectDelay;
  }

  private isValidWebSocketUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "ws:" || parsed.protocol === "wss:";
    } catch {
      return false;
    }
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startHeartbeat(): void {
    if (!this.config.enableKeepAlive) return;

    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ method: "ping" });
      }
    }, this.config.heartbeatInterval);
  }
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      logger.info(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts}) in ${this.reconnectDelay}ms`
      );

      setTimeout(() => {
        this.isManualDisconnect = false; // Reset manual disconnect flag
        this.connect();
      }, this.reconnectDelay);

      // Exponential backoff
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.config.maxReconnectDelay
      );
    } else {
      logger.error(
        "Max reconnection attempts reached, will try again in 60 seconds"
      );
      // Reset attempts and try again after a longer delay to keep connection alive
      setTimeout(() => {
        this.reconnectAttempts = 0;
        this.reconnectDelay = this.config.initialReconnectDelay;
        this.attemptReconnect();
      }, 300000); // Wait 60 seconds before trying again
    }
  }

  private onOpen(event: Event): void {
    logger.info("WebSocket connection opened:", event);
  }
  private onClose(event: CloseEvent): void {
    logger.info("WebSocket connection closed:", event);
  }
  private getClientId(): string {
    const url = new URL(this.url);
    return (
      url.searchParams.get("clientId") ??
      (this.connectionId ? String(this.connectionId) : "")
    );
  }

  public send(data: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const message = JSON.stringify({
          ...data,
          jsonrpc: "2.0",
          timestamp: new Date().toISOString(),
        });
        this.ws.send(message);
        logger.info("Message sent:", message);
        return true;
      } catch (error) {
        logger.error("Error sending message:", error);
        return false;
      }
    } else {
      logger.warn("WebSocket is not connected during send operation.");
      return false;
    }
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public getInfo(): WebSocketInfo {
    return {
      url: this.url,
      connected: this.isConnected(),
      connectionId: this.connectionId,
      clientId: this.getClientId(),
    };
  }

  /**
   * Force reconnection even if currently connected
   */
  public forceReconnect(): void {
    logger.info("Forcing reconnection...");
    this.isManualDisconnect = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = this.config.initialReconnectDelay;

    if (this.ws) {
      this.ws.close(1000, "Force reconnect");
    } else {
      this.connect();
    }
  }

  /**
   * Get heartbeat interval in milliseconds (for testing)
   */
  public getHeartbeatInterval(): number {
    return this.config.heartbeatInterval;
  }

  /**
   * Get keep-alive enabled status (for testing)
   */
  public getEnableKeepAlive(): boolean {
    return this.config.enableKeepAlive;
  }

  public disconnect(): void {
    this.isManualDisconnect = true;
    this.stopCleanupInterval();
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, "Manual disconnect");
      this.ws = null;
      this.connectionId = null;
    }
  }

  public connect(): void {
    try {
      this.isManualDisconnect = false; // Reset manual disconnect flag
      this.ws = new WebSocket(this.url);
      this.ws.onopen = (event) => {
        logger.info("WebSocket connected:", event);
        this.reconnectAttempts = 0;
        this.reconnectDelay = this.config.initialReconnectDelay; // Reset to initial delay
        this.startHeartbeat();
        this.onOpen(event);
      };
      this.ws.onclose = (event) => {
        this.connectionId = null;
        this.stopHeartbeat();
        this.onClose(event);
        // Always attempt reconnect unless it's a manual disconnect
        if (!this.isManualDisconnect) {
          this.attemptReconnect();
        }
      };
      this.ws.onmessage = (event) => {
        logger.info("WebSocket message received:", event.data);
        try {
          const message = JSONRPCUtils.deserialize(event.data);
          if (!message) {
            throw new Error(
              `deserialize returned null or undefined ${event.data}`
            );
          }
          const validMessage = JSONRPCUtils.validateMessage(message);
          if (validMessage.valid) {
            const message = validMessage.message as JSONRPCRequest;
            if (message.method === "server.connected") {
              this.connectionId = ((message.params || {}) as any)
                .connectionId as number;
            } else {
              this.config.handleMessage(validMessage, this);
            }
          } else {
            throw new Error(`Invalid message: ${validMessage.error}`);
          }
        } catch (error) {
          logger.error("Error deserializing WebSocket message:", error);
          return;
        }
      };
    } catch (error) {
      logger.error("Error creating WebSocket connection:", error);
    }
  }
}
