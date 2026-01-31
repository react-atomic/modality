import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  SSEClientTransport,
  type SSEClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamingMCPTransportWrapper } from "./StreamingMCPTransportWrapper";
import { getLoggerInstance } from "modality-kit";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

const clientName = "modality-client";
const logger = getLoggerInstance(clientName);

export interface HttpTransportConfig {
  type: "http";
  url: string;
  options?: StreamableHTTPClientTransportOptions;
}

export interface StdioTransportConfig {
  type: "stdio";
  serverParams: StdioServerParameters;
}

export interface SSETransportConfig {
  type: "sse";
  url: string;
  options?: SSEClientTransportOptions;
}

export type TransportConfig =
  | HttpTransportConfig
  | StdioTransportConfig
  | SSETransportConfig;

class ModalityClientImpl {
  private client: Client;
  private transportConfig: TransportConfig;
  private timeout: number;
  private transport: Transport | null = null;
  private connected: boolean = false;

  constructor(config: TransportConfig, timeout: number = 60000) {
    this.client = new Client({
      name: clientName,
      version: "1.0.0",
    });
    this.transportConfig = config;
    this.timeout = timeout;
  }

  private async getOrCreateTransport(): Promise<Transport> {
    if (!this.transport || !this.connected) {
      // Close orphaned transport if exists but not connected
      if (this.transport) {
        try {
          await this.transport.close();
        } catch {
          // Ignore close errors on orphaned transport
        }
      }
      this.transport = this.createTransport();
      await this.client.connect(this.transport);
      this.connected = true;
    }
    return this.transport;
  }

  private createTransport(): Transport {
    switch (this.transportConfig.type) {
      case "http":
        return new StreamableHTTPClientTransport(
          new URL(this.transportConfig.url),
          this.transportConfig.options
        );
      case "stdio":
        return new StdioClientTransport(this.transportConfig.serverParams);
      case "sse":
        return new SSEClientTransport(
          new URL(this.transportConfig.url),
          this.transportConfig.options
        );
      default:
        throw new Error(
          `Unsupported transport type: ${(this.transportConfig as any).type}`
        );
    }
  }

  private getTransportIdentifier(): string {
    switch (this.transportConfig.type) {
      case "http":
      case "sse":
        return this.transportConfig.url;
      case "stdio":
        return `stdio:${this.transportConfig.serverParams.command}`;
      default:
        return "unknown-transport";
    }
  }

  /**
   * Close transport and kill subprocess (for stdio transports only)
   * Useful for one-off CLI operations where the subprocess should not persist
   */
  private async closeTransportAndKillProcess(transport: Transport): Promise<void> {
    // Close the transport connection
    await transport.close();

    // For stdio transports, forcefully kill the subprocess if it's still running
    if (this.transportConfig.type === "stdio") {
      const stdioBased = transport as any;
      const pid = stdioBased.pid;
      if (pid) {
        try {
          // Send SIGTERM first, wait a bit, then SIGKILL if needed
          process.kill(pid, "SIGTERM");
          // Give it a moment to clean up
          await new Promise(resolve => setTimeout(resolve, 50));
          // Check if still running by trying SIGKILL
          try {
            process.kill(pid, 0); // Just check if process exists
            process.kill(pid, "SIGKILL");
          } catch {
            // Process already gone, that's fine
          }
        } catch {
          // Process already gone or error killing - that's fine
        }
      }
    }
  }

  public async call(
    method: string,
    params?: any,
    autoParse: boolean = true
  ): Promise<any> {
    try {
      await this.getOrCreateTransport();
      const result = await this.client.callTool(
        {
          name: method,
          arguments: params,
        },
        undefined,
        { timeout: this.timeout }
      );
      return autoParse ? this.parseContent(result) : result;
    } catch (error) {
      // Reset connection state on error so next call attempts reconnect
      this.connected = false;
      const transportId = this.getTransportIdentifier();
      logger.error(`${transportId}-call-failed`, error);
      throw error;
    }
  }

  /**
   * Internal method for one-off calls with cleanup
   * @param killProcess - If true, forcefully kill subprocess (for stdio transports)
   */
  private async callOnceInternal(
    method: string,
    params: any,
    autoParse: boolean,
    killProcess: boolean
  ): Promise<any> {
    try {
      return await this.call(method, params, autoParse);
    } finally {
      if (killProcess && this.transport) {
        try {
          await this.closeTransportAndKillProcess(this.transport);
        } catch {
          // Ignore close errors
        }
      }
      this.close();
    }
  }

  public async callOnce(
    method: string,
    params?: any,
    autoParse: boolean = true
  ): Promise<any> {
    return this.callOnceInternal(method, params, autoParse, false);
  }

  /**
   * Call a tool once and kill the subprocess (for stdio transports only)
   * Useful for one-off CLI operations where the subprocess should not persist
   */
  public async callOnceAndKill(
    method: string,
    params?: any,
    autoParse: boolean = true
  ): Promise<any> {
    return this.callOnceInternal(method, params, autoParse, true);
  }

  public callStream(
    method: string,
    params?: any,
    callback?: (p: any) => void
  ): ReadableStream {
    // Streaming is currently only supported for HTTP transport
    if (this.transportConfig.type !== "http") {
      throw new Error(
        `Streaming not supported for ${this.transportConfig.type} transport`
      );
    }

    const client = this.client;
    const url = (this.transportConfig as HttpTransportConfig).url;
    const transportId = this.getTransportIdentifier();

    return new ReadableStream<string>({
      async start(controller) {
        try {
          const streamingTransport = new StreamingMCPTransportWrapper(
            url,
            (content: string) => controller.enqueue(content)
          );
          await client.connect(streamingTransport);
          const content = await client.callTool({
            name: method,
            arguments: params,
          });
          await streamingTransport.close();
          controller.close();
          callback?.(content);
        } catch (error) {
          logger.error(`${transportId}-stream-failed`, error);
          controller.error(error);
        }
      },
    });
  }

  public close(): void {
    this.client.close();
    this.connected = false;
    this.transport = null;
  }

  public async listTools(): Promise<ListToolsResult> {
    try {
      await this.getOrCreateTransport();
      const result = await this.client.listTools();
      return result;
    } catch (error) {
      this.connected = false;
      const transportId = this.getTransportIdentifier();
      logger.error(`${transportId}-listTools-failed`, error);
      throw error;
    }
  }

  public parseContent(toolResult: any): unknown {
    try {
      const content = toolResult?.content?.[0];
      if (content?.type === "text" && content.text) {
        return JSON.parse(content.text);
      }
      return content ?? toolResult;
    } catch {
      const content = toolResult?.content?.[0];
      return content?.text ?? content ?? toolResult;
    }
  }
}

export type ModalityClientInstance = ModalityClientImpl;

function http(
  url: string,
  timeout?: number,
  options?: StreamableHTTPClientTransportOptions,
): ModalityClientInstance {
  return new ModalityClientImpl({ type: "http", url, options }, timeout);
}

function stdio(
  serverParams: StdioServerParameters,
  timeout?: number
): ModalityClientInstance {
  return new ModalityClientImpl({ type: "stdio", serverParams }, timeout);
}

function sse(
  url: string,
  timeout?: number,
  options?: SSEClientTransportOptions,
): ModalityClientInstance {
  return new ModalityClientImpl({ type: "sse", url, options }, timeout);
}

export const ModalityClient = {
  http,
  stdio,
  sse,
};

