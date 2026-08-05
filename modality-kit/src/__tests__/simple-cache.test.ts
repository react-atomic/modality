import { describe, expect, test } from "bun:test";
import { SimpleCache } from "../simple-cache";

describe("SimpleCache — get/set", () => {
  test("stores and returns a value", () => {
    const cache = new SimpleCache<string>();
    cache.set("a", "one");
    expect(cache.get("a")).toBe("one");
  });

  test("a missing key is null", () => {
    expect(new SimpleCache<string>().get("nope")).toBeNull();
  });

  test("an expired entry is dropped", async () => {
    const cache = new SimpleCache<string>({ ttlMs: 1 });
    cache.set("a", "one");
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.get("a")).toBeNull();
  });

  test("ignoreTTL returns an expired entry anyway", async () => {
    const cache = new SimpleCache<string>({ ttlMs: 1 });
    cache.set("a", "one");
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.get("a", true)).toBe("one");
  });

  test("a per-entry ttl overrides the instance default", async () => {
    const cache = new SimpleCache<string>({ ttlMs: 60_000 });
    cache.set("short", "one", 1);
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.get("short")).toBeNull();
  });

  test("delete and clear remove entries", () => {
    const cache = new SimpleCache<string>();
    cache.set("a", "one");
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeNull();

    cache.set("b", "two");
    cache.clear();
    expect(cache.keys()).toEqual([]);
  });

  test("has() is false once the entry has expired", async () => {
    const cache = new SimpleCache<string>({ ttlMs: 1 });
    cache.set("a", "one");
    expect(cache.has("a")).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(cache.has("a")).toBe(false);
  });

  test("enableLru:false keeps the cache unbounded", () => {
    const cache = new SimpleCache<string>(); // enableLru defaults to false
    for (let i = 0; i < 150; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    expect(cache.keys().length).toBe(150);
    expect(cache.has("key0")).toBe(true);
  });

  test("enableLru:true with a maxSize still evicts", () => {
    const cache = new SimpleCache<string>({ enableLru: true, maxSize: 10 });
    for (let i = 0; i < 30; i++) {
      cache.set(`key${i}`, `value${i}`);
    }
    expect(cache.keys().length).toBeLessThanOrEqual(10);
    expect(cache.has("key0")).toBe(false);
  });
});

describe("SimpleCache — getOrLoad", () => {
  test("loads on a miss and caches the result", async () => {
    const cache = new SimpleCache<string>();
    let loads = 0;
    const load = async () => {
      loads++;
      return "value";
    };

    expect(await cache.getOrLoad("a", load)).toBe("value");
    expect(await cache.getOrLoad("a", load)).toBe("value");
    expect(loads).toBe(1);
  });

  // The reason this method exists: a TTL does nothing for callers that all
  // arrive while the cache is still empty.
  test("concurrent misses share one load", async () => {
    const cache = new SimpleCache<string>();
    let loads = 0;
    const load = async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 10));
      return "value";
    };

    const results = await Promise.all(
      Array.from({ length: 50 }, () => cache.getOrLoad("a", load)),
    );

    expect(loads).toBe(1);
    expect(results).toEqual(Array(50).fill("value"));
  });

  test("the in-flight slot is released so later calls can reload", async () => {
    const cache = new SimpleCache<string>({ ttlMs: 1 });
    let loads = 0;
    const load = async () => {
      loads++;
      return `value${loads}`;
    };

    expect(await cache.getOrLoad("a", load)).toBe("value1");
    await new Promise((r) => setTimeout(r, 5));
    expect(await cache.getOrLoad("a", load)).toBe("value2");
    expect(loads).toBe(2);
  });

  test("a rejected load is not cached and does not poison the key", async () => {
    const cache = new SimpleCache<string>();
    let loads = 0;
    const failing = async () => {
      loads++;
      throw new Error("boom");
    };

    await expect(cache.getOrLoad("a", failing)).rejects.toThrow("boom");
    await expect(cache.getOrLoad("a", failing)).rejects.toThrow("boom");
    expect(loads).toBe(2);
    expect(cache.get("a")).toBeNull();
  });

  test("concurrent callers all see a rejection", async () => {
    const cache = new SimpleCache<string>();
    let loads = 0;
    const failing = async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 5));
      throw new Error("boom");
    };

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => cache.getOrLoad("a", failing)),
    );

    expect(loads).toBe(1);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
  });

  test("shouldCache:false resolves the caller but stores nothing", async () => {
    const cache = new SimpleCache<{ status: number }>();
    let loads = 0;
    const load = async () => {
      loads++;
      return { status: 429 };
    };
    const shouldCache = (v: { status: number }) => v.status < 400;

    expect(await cache.getOrLoad("a", load, { shouldCache })).toEqual({ status: 429 });
    expect(cache.get("a")).toBeNull();

    await cache.getOrLoad("a", load, { shouldCache });
    expect(loads).toBe(2);
  });

  test("a per-call ttlMs governs the stored entry", async () => {
    const cache = new SimpleCache<string>({ ttlMs: 60_000 });
    let loads = 0;
    const load = async () => {
      loads++;
      return "value";
    };

    await cache.getOrLoad("a", load, { ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await cache.getOrLoad("a", load, { ttlMs: 1 });
    expect(loads).toBe(2);
  });

  test("different keys load independently", async () => {
    const cache = new SimpleCache<string>();
    let loads = 0;
    const load = async () => {
      loads++;
      return "value";
    };

    await Promise.all([cache.getOrLoad("a", load), cache.getOrLoad("b", load)]);
    expect(loads).toBe(2);
  });

  test("shouldCache returning true stores the value for the next call", async () => {
    const cache = new SimpleCache<string>();
    let loads = 0;
    const load = async () => {
      loads++;
      return "value";
    };
    const shouldCache = () => true;

    expect(await cache.getOrLoad("a", load, { shouldCache })).toBe("value");
    expect(await cache.getOrLoad("a", load, { shouldCache })).toBe("value");
    expect(loads).toBe(1);
  });

  test("delete() during a load keeps the key empty when that load settles", async () => {
    const cache = new SimpleCache<string>();
    let resolveLoad: (v: string) => void = () => {};
    const load = () =>
      new Promise<string>((resolve) => {
        resolveLoad = resolve;
      });

    const pending = cache.getOrLoad("a", load);
    cache.delete("a");
    resolveLoad("stale");
    await pending;

    expect(cache.get("a")).toBeNull();
  });

  test("delete() during a load lets the next call load fresh, and the stale result cannot clobber it", async () => {
    const cache = new SimpleCache<string>();
    let loads = 0;
    let resolveFirst: (v: string) => void = () => {};
    const load = () =>
      new Promise<string>((resolve) => {
        loads++;
        if (loads === 1) resolveFirst = resolve;
        else resolve("fresh");
      });

    const first = cache.getOrLoad("a", load);
    cache.delete("a");
    const second = cache.getOrLoad("a", load);
    resolveFirst("stale");
    await Promise.all([first, second]);

    expect(loads).toBe(2);
    expect(cache.get("a")).toBe("fresh");
  });

  test("clear() during a load drops that load's eventual result", async () => {
    const cache = new SimpleCache<string>();
    let resolveLoad: (v: string) => void = () => {};
    const load = () =>
      new Promise<string>((resolve) => {
        resolveLoad = resolve;
      });

    const pending = cache.getOrLoad("a", load);
    cache.clear();
    resolveLoad("stale");
    await pending;

    expect(cache.get("a")).toBeNull();
    expect(cache.keys()).toEqual([]);
  });
});
