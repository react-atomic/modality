/**
 * SimpleCache - Unified caching utility with TTL and LRU support
 *
 * Supports two caching strategies:
 * - TTL-based: Entries expire after specified time
 * - LRU: Least Recently Used eviction when size limit reached
 * - Hybrid: Both TTL and LRU can be enabled together
 */

import { LruCache } from "./lruCache";

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl?: number; // TTL in milliseconds, undefined = no TTL
}

/**
 * Cache options
 */
export interface SimpleCacheOptions {
  /** TTL in milliseconds. Set to undefined to disable TTL. Default: 300000 (5 minutes) */
  ttlMs?: number;
  /** Enable LRU eviction. Default: false */
  enableLru?: boolean;
  /** Max cache size for LRU. Default: 100 */
  maxSize?: number;
}

/**
 * SimpleCache - Generic cache supporting TTL and/or LRU eviction
 */
export class SimpleCache<T> {
  private lruCache: LruCache<CacheEntry<T>>;
  private readonly ttlMs: number | undefined;
  private readonly maxSize: number;

  constructor(options: SimpleCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 300000; // 5 minutes default
    this.maxSize = options.maxSize ?? 100;

    // Initialize LRU cache if enabled
    this.lruCache = new LruCache<CacheEntry<T>>(this.maxSize);
  }

  /**
   * Set cache entry
   * @param key Cache key
   * @param data Data to cache
   * @param ttlMs Optional override for TTL (if undefined, uses instance TTL)
   */
  set(key: string, data: T, ttlMs?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs ?? this.ttlMs,
    };

    this.lruCache.set(key, entry);
  }

  /**
   * Get cache entry if still valid (not expired and not evicted by LRU)
   */
  get(key: string, ignoreTTL?: boolean): T | null {
    const entry = this.lruCache.get(key);
    if (!entry) return null;

    // Check TTL expiration
    if (entry.ttl !== undefined && !ignoreTTL) {
      const age = Date.now() - entry.timestamp;
      if (age > entry.ttl) {
        this.lruCache.delete(key);
        return null;
      }
    }

    return entry.data;
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    return this.lruCache.has(key);
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const existed = this.lruCache.delete(key);
    // Note: LruCache doesn't expose delete method
    return existed;
  }

  keys(): string[] {
    return this.lruCache.keys();
  }
}
