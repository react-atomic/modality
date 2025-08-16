import { test, expect, describe } from "bun:test";
import { LruCache } from "../lruCache";

describe("LruCache", () => {
  test("should set and get items", () => {
    const cache = new LruCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
  });

  test("should return undefined for non-existent items", () => {
    const cache = new LruCache<number>(3);
    expect(cache.get("a")).toBeUndefined();
  });

  test("should evict least recently used item", () => {
    const cache = new LruCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // This should evict "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  test("getting an item should make it most recently used", () => {
    const cache = new LruCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.get("a"); // "a" is now the most recently used
    cache.set("d", 4); // This should evict "b"
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  test("setting an existing item should make it most recently used", () => {
    const cache = new LruCache<number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("a", 10); // "a" is now the most recently used
    cache.set("d", 4); // This should evict "b"
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(10);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  test("should correctly check for item existence with has()", () => {
    const cache = new LruCache<number>(3);
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  test("should evict 25% of items when max size is reached", () => {
    const cache = new LruCache<number>(4);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4);
    cache.set("e", 5); // This should evict 25% of 4, which is 1 item ("a")
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.has("d")).toBe(true);
    expect(cache.has("e")).toBe(true);
  });

  test("should handle a large number of items and evictions", () => {
    const cache = new LruCache<number>(100);
    for (let i = 0; i < 150; i++) {
      cache.set(`key${i}`, i);
    }
    // First 50 items should be evicted
    expect(cache.has("key0")).toBe(false);
    expect(cache.has("key49")).toBe(false);
    // Last 100 items should be present
    expect(cache.has("key50")).toBe(true);
    expect(cache.has("key149")).toBe(true);
  });
});
