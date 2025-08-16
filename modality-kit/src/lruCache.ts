export class LruCache<T> {
  private values: Map<string, T> = new Map<string, T>();
  private max: number;

  constructor(max = 100) {
    this.max = max;
  }

  public has(key: string): boolean {
    return this.values.has(key);
  }

  public get(key: string): T | undefined {
    const value = this.values.get(key);
    if (value) {
      // move to end of map
      this.values.delete(key);
      this.values.set(key, value);
    }
    return value;
  }

  public set(key: string, value: T): void {
    if (this.values.size >= this.max) {
      const itemsToEvictCount = Math.max(1, Math.floor(this.max * 0.25));
      const keys = this.values.keys();
      let count = 0;
      while (count < itemsToEvictCount) {
        const next = keys.next();
        if (next.done) {
          break;
        }
        this.values.delete(next.value);
        count++;
      }
    }
    this.values.set(key, value);
  }
}
