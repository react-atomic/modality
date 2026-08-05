/**
 * SimpleCache - Unified caching utility with TTL and LRU support
 *
 * Supports two caching strategies:
 * - TTL-based: Entries expire after specified time
 * - LRU: Least Recently Used eviction when size limit reached
 * - Hybrid: Both TTL and LRU can be enabled together
 *
 * `getOrLoad` adds single-flight loading on top: concurrent misses for the same
 * key share one load instead of each firing their own.
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
  /** Enable LRU eviction. When false (default), the cache grows unbounded. */
  enableLru?: boolean;
  /** Max cache size for LRU. Default: 100 */
  maxSize?: number;
}

/**
 * Per-call options for {@link SimpleCache.getOrLoad}
 */
export interface GetOrLoadOptions<T> {
  /** TTL override for the value this load produces. Defaults to the instance TTL. */
  ttlMs?: number;
  /**
   * Decides whether a loaded value is worth keeping. Returning false resolves
   * the caller normally but stores nothing, so the next call loads again —
   * useful when a "successful" load can still carry an error payload that must
   * not be served for the rest of the TTL.
   */
  shouldCache?: (value: T) => boolean;
}

/**
 * SimpleCache - Generic cache supporting TTL and/or LRU eviction
 */
export class SimpleCache<T = any> {
  private lruCache: LruCache<CacheEntry<T>>;
  private inFlight: Map<string, Promise<T>> = new Map<string, Promise<T>>();
  private readonly ttlMs: number | undefined;
  private readonly maxSize: number;

  constructor(options: SimpleCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 300000; // 5 minutes default
    this.maxSize = options.maxSize ?? 100;

    // LRU eviction only when enabled — otherwise the cache is unbounded.
    this.lruCache = new LruCache<CacheEntry<T>>(options.enableLru ? this.maxSize : Infinity);
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
   * Get `key` from the cache, or run `loader` to produce it.
   *
   * Concurrent misses for the same key share a single load — the second caller
   * joins the first one's promise instead of starting a second load. That is
   * the point of this method: a TTL alone does nothing for callers that all
   * arrive while the cache is still empty, which is exactly the burst that
   * overloads a rate-limited upstream.
   *
   * A rejected load is not cached and does not settle the key, so the next
   * caller retries rather than inheriting the failure for the whole TTL.
   *
   * Callers that join an in-flight load do not get a say in the outcome: the
   * first caller's options govern the shared result. And a `null` result is
   * treated as a miss — it is stored, but the next call loads again because
   * `get` uses `null` as its miss sentinel. Use `shouldCache` to skip storing
   * such results.
   */
  async getOrLoad(
    key: string,
    loader: () => Promise<T>,
    options: GetOrLoadOptions<T> = {},
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    // Named (rather than an immediately-invoked expression) so the body can
    // check, on settle, whether it still owns its in-flight slot: a load
    // deleted or cleared mid-flight must not repopulate the key when it
    // finishes. The promise is assigned before the body can run — the first
    // await suspends until after the synchronous block completes.
    const runLoad = async (): Promise<T> => {
      const value = await loader();
      if (
        this.inFlight.get(key) === promise &&
        (options.shouldCache?.(value) ?? true)
      ) {
        this.set(key, value, options.ttlMs);
      }
      return value;
    };
    const promise = runLoad();

    this.inFlight.set(key, promise);
    // Clear the in-flight slot on settle. Both handlers return void, so this
    // derived promise never rejects — the original still carries the error to
    // the caller.
    const release = () => {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    };
    promise.then(release, release);

    return promise;
  }

  /**
   * Check if key exists and is valid (not expired and not evicted by LRU)
   */
  has(key: string): boolean {
    // Delegate to get(): the miss sentinel (null) is the definition of invalid.
    return this.get(key) !== null;
  }

  /**
   * Delete a specific key, including any load in flight for it — that load's
   * eventual result will not be stored.
   */
  delete(key: string): boolean {
    this.inFlight.delete(key);
    return this.lruCache.delete(key);
  }

  keys(): string[] {
    return this.lruCache.keys();
  }

  /** Drop every entry, including loads still in flight. */
  clear(): void {
    this.inFlight.clear();
    this.lruCache.clear();
  }
}
