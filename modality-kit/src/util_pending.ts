/**
 * Sharable Pending Operations Library
 *
 * A generic library for managing pending operations with timeout, cleanup,
 * and lifecycle management. Can be used on both client and server sides
 * for WebSocket communication or any async operation tracking.
 */

import { JSONRPCResponse, JSONRPCUtils } from "./schemas/jsonrpc";
const getUUID = () => crypto.randomUUID();

/**
 * Configuration options for PendingOperations
 *
 * @interface PendingOperationsConfig
 * @description Configures timeout behavior, cleanup intervals, and ID generation for pending operations
 */
export interface PendingOperationsConfig {
  /**
   * Default timeout in milliseconds for operations (default: 30000)
   * @default 30000
   * @description Sets the default timeout for operations that don't specify their own timeout
   */
  defaultTimeout?: number;

  /**
   * Cleanup interval in milliseconds for expired operations (default: 10000)
   * @default 10000
   * @description How often the system checks for and cleans up expired operations
   */
  cleanupInterval?: number;

  /**
   * Enable automatic cleanup of expired operations (default: true)
   * @default true
   * @description Whether to automatically clean up expired operations in the background
   */
  enableAutoCleanup?: boolean;

  /**
   * Custom ID generator function (default: randomUUIDv7)
   * @default getUUID
   * @description Function to generate unique IDs for operations. Must return unique strings.
   */
  generateId?: () => string;
}

/**
 * Base interface for all pending operation data
 *
 * @interface PendingOperationBase
 * @description Common properties shared by all pending operation types
 */
export interface PendingOperationBase {
  /**
   * Unique identifier for the operation
   * @description Generated automatically by the ID generator function
   */
  id: string;

  /**
   * Timestamp when the operation was created
   * @description Used for age calculations and timeout management
   */
  timestamp: number;

  /**
   * Timeout in milliseconds for this specific operation
   * @description Overrides the default timeout if specified
   */
  timeout?: number;

  /**
   * Optional data for the operation
   * @description Arbitrary data for application-specific use
   */
  data?: any;
}

/**
 * Promise-based pending operation (used for server-to-client calls)
 *
 * @interface PromisePendingOperation
 * @extends PendingOperationBase
 * @description Represents an operation that provides a Promise interface for async resolution
 * @example
 * ```typescript
 * const { id, promise } = pendingOps.addPromiseOperation();
 * promise.then(result => console.log('Success:', result));
 * // Later: pendingOps.resolve(id, { data: 'result' });
 * ```
 */
export interface PromisePendingOperation extends PendingOperationBase {
  /** Operation type identifier */
  type: "promise";

  /**
   * Promise resolve function
   * @description Called when the operation completes successfully
   */
  resolve: (value: any) => void;

  /**
   * Promise reject function
   * @description Called when the operation fails or times out
   */
  reject: (reason?: any) => void;

  /**
   * Optional timeout handle for cleanup
   * @description Internal timeout handle for automatic cleanup
   */
  timeoutHandle?: NodeJS.Timeout;
}

/**
 * Data-based pending operation (used for request tracking and context storage)
 * Replaces both RequestPendingOperation and ContextPendingOperation
 *
 * @interface DataPendingOperation
 * @extends PendingOperationBase
 * @description Flexible operation type that can store any data payload. Use for client-server requests, context tracking, or any data-centric operations.
 * @example
 * ```typescript
 * // Request-style usage
 * const id = pendingOps.addDataOperation(
 *   { requestType: 'getUserProfile', payload: { userId: 123 } },
 *   { connectionId: 'client-001', timeout: 30000 }
 * );
 *
 * // Context-style usage
 * const id2 = pendingOps.addDataOperation(
 *   { functionName: 'processCommand', context: { command: 'export' } },
 *   { timeout: 60000 }
 * );
 * ```
 */
export interface DataPendingOperation extends PendingOperationBase {
  /** Operation type identifier */
  type: "data";

  /**
   * Arbitrary data payload for the operation
   * @description Can contain requestType/payload, functionName/context, connectionId, connection, or any other data structure
   */
  data: any;

  /**
   * Optional timeout handle for cleanup
   * @description Internal timeout handle for automatic cleanup
   */
  timeoutHandle?: NodeJS.Timeout;
}

/**
 * Union type for all pending operation types
 */
export type PendingOperation = PromisePendingOperation | DataPendingOperation;

/**
 * Event handlers for pending operations
 */
export interface PendingOperationEventHandlers {
  /** Called when an operation times out */
  onTimeout?: (operation: PendingOperation) => void;
  /** Called when an operation is resolved */
  onResolve?: (operation: PendingOperation, result?: any) => void;
  /** Called when an operation is rejected */
  onReject?: (operation: PendingOperation, reason?: any) => void;
  /** Called when an operation is removed/cleaned up */
  onCleanup?: (operation: PendingOperation) => void;
}

/**
 * Statistics about pending operations
 */
export interface PendingOperationStats {
  /** Total number of pending operations */
  total: number;
  /** Number of operations by type */
  byType: Record<string, number>;
  /** Number of operations that will expire soon (within next minute) */
  expiringSoon: number;
  /** Oldest operation timestamp */
  oldestTimestamp?: number;
  /** Average age of operations in milliseconds */
  averageAge: number;
}

/**
 * Abstract base class for pending operations management
 * Contains all common functionality while allowing specialized subclasses
 */
export abstract class PendingOperationsBase {
  protected operations = new Map<string, PendingOperation>();
  protected config: Required<PendingOperationsConfig>;
  protected cleanupIntervalHandle?: NodeJS.Timeout;
  protected eventHandlers: PendingOperationEventHandlers = {};

  constructor(
    config: PendingOperationsConfig = {},
    eventHandlers: PendingOperationEventHandlers = {}
  ) {
    this.config = {
      defaultTimeout: 30000,
      cleanupInterval: 10000,
      enableAutoCleanup: true,
      generateId: getUUID,
      ...config,
    };
    this.eventHandlers = eventHandlers;

    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Resolve a pending operation with a result
   */
  resolve(id: string, result?: any): boolean {
    const operation = this.operations.get(id);
    if (!operation) {
      return false;
    }

    if (operation.timeoutHandle) {
      clearTimeout(operation.timeoutHandle);
    }

    if (operation.type === "promise") {
      operation.resolve(result);
    }

    if (this.eventHandlers.onResolve) {
      this.eventHandlers.onResolve(operation, result);
    }

    this.operations.delete(id);
    return true;
  }

  /**
   * Reject a pending operation with a reason
   */
  reject(id: string, reason?: any): boolean {
    const operation = this.operations.get(id);
    if (!operation) {
      return false;
    }

    if (operation.timeoutHandle) {
      clearTimeout(operation.timeoutHandle);
    }

    if (operation.type === "promise") {
      operation.reject(reason);
    }

    if (this.eventHandlers.onReject) {
      this.eventHandlers.onReject(operation, reason);
    }

    this.operations.delete(id);
    return true;
  }

  /**
   * Get a pending operation by ID
   */
  get(id: string): PendingOperation | undefined {
    return this.operations.get(id);
  }

  /**
   * Check if an operation exists
   */
  has(id: string): boolean {
    return this.operations.has(id);
  }

  /**
   * Remove an operation without resolving or rejecting
   */
  remove(id: string): boolean {
    const operation = this.operations.get(id);
    if (!operation) {
      return false;
    }

    if (operation.timeoutHandle) {
      clearTimeout(operation.timeoutHandle);
    }

    if (this.eventHandlers.onCleanup) {
      this.eventHandlers.onCleanup(operation);
    }

    this.operations.delete(id);
    return true;
  }

  /**
   * Get all pending operations
   */
  getAll(): Map<string, PendingOperation> {
    return new Map(this.operations);
  }

  /**
   * Get pending operations by type
   */
  getByType(type: PendingOperation["type"]): PendingOperation[] {
    return Array.from(this.operations.values()).filter(
      (op) => op.type === type
    );
  }

  /**
   * Clear all pending operations
   */
  clear(reason?: any): number {
    const count = this.operations.size;

    const keys = Array.from(this.operations.keys());
    for (const id of keys) {
      this.reject(id, reason || "All operations cleared");
    }

    return count;
  }

  /**
   * Clean up expired operations
   */
  cleanupExpired(): number {
    const now = Date.now();
    const expiredOperations: string[] = [];

    for (const [id, operation] of Array.from(this.operations.entries())) {
      if (operation.timeout && operation.timeout > 0) {
        const expirationTime = operation.timestamp + operation.timeout;
        if (now >= expirationTime) {
          expiredOperations.push(id);
        }
      }
    }

    for (const id of expiredOperations) {
      this.handleTimeout(this.operations.get(id)!);
    }

    return expiredOperations.length;
  }

  /**
   * Get statistics about pending operations
   */
  getStats(): PendingOperationStats {
    const now = Date.now();
    const operations = Array.from(this.operations.values());

    const byType: Record<string, number> = {};
    let totalAge = 0;
    let expiringSoon = 0;
    let oldestTimestamp: number | undefined;

    for (const operation of operations) {
      byType[operation.type] = (byType[operation.type] || 0) + 1;

      const age = now - operation.timestamp;
      totalAge += age;

      if (!oldestTimestamp || operation.timestamp < oldestTimestamp) {
        oldestTimestamp = operation.timestamp;
      }

      if (operation.timeout && operation.timeout > 0) {
        const expirationTime = operation.timestamp + operation.timeout;
        const timeToExpiry = expirationTime - now;
        if (timeToExpiry <= 60000 && timeToExpiry > 0) {
          expiringSoon++;
        }
      }
    }

    return {
      total: operations.length,
      byType,
      expiringSoon,
      oldestTimestamp,
      averageAge: operations.length > 0 ? totalAge / operations.length : 0,
    };
  }

  /**
   * Start automatic cleanup of expired operations
   */
  private startAutoCleanup(): void {
    if (this.cleanupIntervalHandle) {
      return;
    }

    this.cleanupIntervalHandle = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupIntervalHandle) {
      clearInterval(this.cleanupIntervalHandle);
      this.cleanupIntervalHandle = undefined;
    }
  }

  /**
   * Handle operation timeout
   */
  protected handleTimeout({ id }: { id: string }): void {
    const operation = this.operations.get(id);
    if (operation) {
      if (this.eventHandlers.onTimeout) {
        this.eventHandlers.onTimeout(operation);
      }

      this.reject(
        operation.id,
        new Error(`Operation timed out after ${operation.timeout}ms`)
      );
    }
  }

  /**
   * Destroy the pending operations manager
   */
  destroy(reason?: any): void {
    this.stopAutoCleanup();
    this.clear(reason || "PendingOperations destroyed");
  }

  /**
   * Get the current configuration
   */
  getConfig(): Required<PendingOperationsConfig> {
    return { ...this.config };
  }

  /**
   * Update event handlers
   */
  setEventHandlers(handlers: PendingOperationEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Abstract method that subclasses must implement for their specific operation type
   */
  abstract add(...args: any[]): any;

  handleAdd(
    options: {
      timeout?: number;
      customId?: string;
    } = {}
  ) {
    const id = options.customId ?? this.config.generateId();
    const timeout = options.timeout ?? this.config.defaultTimeout;

    if (options.customId && this.operations.has(options.customId)) {
      throw new Error(`Operation with ID '${options.customId}' already exists`);
    }

    const timeoutHandle =
      timeout > 0
        ? setTimeout(() => {
            this.handleTimeout({ id });
          }, timeout)
        : undefined;

    return { id, timeout, timeoutHandle };
  }
}

/**
 * Specialized class for promise-based operations only
 * Enforces type safety by only exposing promise-related methods
 */
export class PromisePendingOperations extends PendingOperationsBase {
  /**
   * Add a promise-based pending operation
   */
  add(
    data: any,
    options: {
      timeout?: number;
      customId?: string;
    } = {}
  ): { id: string; promise: Promise<any> } {
    const { id, timeout, timeoutHandle } = this.handleAdd(options);

    const promise = new Promise<any>((resolve, reject) => {
      const operation: PromisePendingOperation = {
        id,
        type: "promise",
        timestamp: Date.now(),
        timeout,
        timeoutHandle,
        data,
        resolve,
        reject,
      };
      this.operations.set(id, operation);
    });

    return { id, promise };
  }
}

/**
 * Specialized class for data-based operations only
 * Enforces type safety by only exposing data-related methods
 */
export class DataPendingOperations extends PendingOperationsBase {
  /**
   * Add a data-based pending operation
   */
  add(
    data: any,
    options: {
      timeout?: number;
      customId?: string;
    } = {}
  ): { id: string } {
    const { id, timeout, timeoutHandle } = this.handleAdd(options);

    const operation: DataPendingOperation = {
      id,
      type: "data",
      timestamp: Date.now(),
      timeout,
      timeoutHandle,
      data,
    };

    this.operations.set(id, operation);
    return { id };
  }
}

/**
 * Create a PendingOperations instance with Promise-based operations
 * Optimized for server-to-client function calls
 *
 * @param config Optional configuration for the pending operations
 * @param eventHandlers Optional event handlers for operation lifecycle
 * @returns PromisePendingOperations instance that only allows promise operations
 */
export function createPromisePendingOperations(
  config?: PendingOperationsConfig,
  eventHandlers?: PendingOperationEventHandlers
): PromisePendingOperations {
  return new PromisePendingOperations(
    {
      defaultTimeout: 30000,
      cleanupInterval: 30000,
      enableAutoCleanup: true,
      ...config,
    },
    eventHandlers
  );
}

/**
 * Create a PendingOperations instance with Data-based operations
 * Optimized for both request processing and context handling
 *
 * @param config Optional configuration for the pending operations
 * @param eventHandlers Optional event handlers for operation lifecycle
 * @returns DataPendingOperations instance that only allows data operations
 */
export function createDataPendingOperations(
  config?: PendingOperationsConfig,
  eventHandlers?: PendingOperationEventHandlers
): DataPendingOperations {
  return new DataPendingOperations(
    {
      defaultTimeout: 30000,
      cleanupInterval: 30000,
      enableAutoCleanup: true,
      ...config,
    },
    eventHandlers
  );
}

export class JSONRPCCall {
  private pendingRequests: PromisePendingOperations;
  constructor(config: PendingOperationsConfig = {}) {
    // Initialize pending operations with event handling
    const pendingEventHandlers: PendingOperationEventHandlers = {
      onTimeout: (operation) => {
        console.warn(`JSON-RPC operation timed out:`, operation.id);
      },
      onResolve: (operation, _result) => {
        console.log(`JSON-RPC operation resolved:`, operation.id);
      },
      onReject: (operation, reason) => {
        console.error(`JSON-RPC operation rejected:`, operation.id, reason);
      },
    };
    this.pendingRequests = createPromisePendingOperations(
      config,
      pendingEventHandlers
    );
  }

  /**
   * Process a JSON-RPC response
   */
  public handleResponse(response: JSONRPCResponse): void {
    const id = response.id as string;

    if (JSONRPCUtils.isSuccessResponse(response)) {
      this.pendingRequests.resolve(id, response.result);
    } else {
      this.pendingRequests.reject(id, new Error(response.error.message));
    }
  }

  /**
   * Send a JSON-RPC request and return a promise for the response
   */
  public async handleRequest(
    method: string,
    params?: any,
    options: { timeout?: number } = {}
  ): Promise<any> {
    const { promise } = this.pendingRequests.add({ method, params }, options);

    // Send the request (this should be handled by the WebSocket layer)
    return promise;
  }

  /**
   * Get manager statistics
   */
  getStats() {
    return {
      pendingRequests: this.pendingRequests.getStats(),
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.pendingRequests.destroy("JSONRPCManager destroyed");
  }
}
