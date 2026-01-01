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

const clientName = "modality-client";
const logger = getLoggerInstance(clientName);

export type TransportType = "http" | "stdio" | "sse";

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

  constructor(config: TransportConfig, timeout: number = 60000) {
    this.client = new Client({
      name: clientName,
      version: "1.0.0",
    });
    this.transportConfig = config;
    this.timeout = timeout;
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

  public async call(
    method: string,
    params?: any,
    autoParse: boolean = true
  ): Promise<any> {
    try {
      const client = this.client;
      const transport = this.createTransport();
      await client.connect(transport);
      const result = await client.callTool(
        {
          name: method,
          arguments: params,
        },
        undefined,
        { timeout: this.timeout }
      );
      if (autoParse) {
        return this.parseContent(result);
      } else {
        return result;
      }
    } catch (error) {
      const transportId = this.getTransportIdentifier();
      logger.error(`${transportId}-call-failed`, error);
      throw error; // Re-throw the error so VsCodeLmProvider can handle it
    }
  }

  public async callOnce(
    method: string,
    params?: any,
    autoParse: boolean = true
  ): Promise<any> {
    let result;
    try {
      result = await this.call(method, params, autoParse);
    } catch (error) {
      this.client.close();
    }
    this.client.close();
    return result;
  }

  public callStream(
    method: string,
    params?: any,
    callback?: (p: any) => void
  ): ReadableStream {
    try {
      const client = this.client;

      // Streaming is currently only supported for HTTP transport
      if (this.transportConfig.type !== "http") {
        throw new Error(
          `Streaming not supported for ${this.transportConfig.type} transport`
        );
      }

      const url = (this.transportConfig as HttpTransportConfig).url;
      const stream = new ReadableStream<string>({
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
            logger.error("Streaming error:", error);
            controller.error(error);
          }
        },
      });
      return stream;
    } catch (error) {
      const transportId = this.getTransportIdentifier();
      logger.error(`${transportId}-stream-failed`, error);
      const errorStream = new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            `Error: ${error instanceof Error ? error.message : String(error)}`
          );
          controller.close();
        },
      });
      return errorStream;
    }
  }

  public close(): void {
    this.client.close();
  }

  public async listTools(): Promise<any> {
    try {
      const client = this.client;
      const transport = this.createTransport();
      await client.connect(transport);
      const result = await client.listTools();
      return result;
    } catch (error) {
      const transportId = this.getTransportIdentifier();
      logger.error(`${transportId}-listTools-failed`, error);
      throw error;
    }
  }

  public parseContent(toolResult: any): any {
    try {
      const obj = JSON.parse(toolResult.content[0].text);
      return obj;
    } catch (error) {
      return toolResult.content[0].text;
    }
  }
}

function http(
  url: string,
  timeout?: number,
  options?: StreamableHTTPClientTransportOptions,
): ModalityClientImpl {
  return new ModalityClientImpl({ type: "http", url, options }, timeout);
}

function stdio(
  serverParams: StdioServerParameters,
  timeout?: number
): ModalityClientImpl {
  return new ModalityClientImpl({ type: "stdio", serverParams }, timeout);
}

function sse(
  url: string,
  timeout?: number,
  options?: SSEClientTransportOptions,
): ModalityClientImpl {
  return new ModalityClientImpl({ type: "sse", url, options }, timeout);
}

export const ModalityClient = {
  http,
  stdio,
  sse,
};

export type ModalityClientInstance = ModalityClientImpl;
