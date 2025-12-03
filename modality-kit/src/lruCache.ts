export class LruCache<T> {
  private _values: Map<string, T> = new Map<string, T>();
  private max: number;

  constructor(max = 100) {
    this.max = max;
  }

  public has(key: string): boolean {
    return this._values.has(key);
  }

  public get(key: string): T | undefined {
    const value = this._values.get(key);
    if (value) {
      // move to end of map
      this._values.delete(key);
      this._values.set(key, value);
    }
    return value;
  }

  public set(key: string, value: T): void {
    if (this.size() >= this.max) {
      const itemsToEvictCount = Math.max(1, Math.floor(this.max * 0.25));
      const keys = this._values.keys();
      let count = 0;
      while (count < itemsToEvictCount) {
        const next = keys.next();
        if (next.done) {
          break;
        }
        this._values.delete(next.value);
        count++;
      }
    }
    this._values.set(key, value);
  }

  public delete(key: string): boolean {
    return this._values.delete(key);
  }

  public clear(): void {
    this._values.clear();
  }

  public size(): number {
    return this._values.size;
  }

  public values(): IterableIterator<T> {
    return this._values.values();
  }

  public keys(): string[] {
    return [...this._values.keys()];
  }
}
