import type {
  IdempotencyStorePort,
  IdempotencyRecord,
} from "../../core/ports/idempotency-store.port";

export class MemoryIdempotencyStore<T> implements IdempotencyStorePort<T> {
  private readonly map = new Map<string, IdempotencyRecord<T>>();
  private readonly maxKeys: number;

  constructor(maxKeys: number = 500) {
    this.maxKeys = maxKeys;
  }

  async get(key: string): Promise<IdempotencyRecord<T> | null> {
    const rec = this.map.get(key);
    if (!rec) return null;
    if (Date.now() > rec.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return rec;
  }

  async set(record: IdempotencyRecord<T>): Promise<void> {
    this.cleanupExpired();
    this.map.set(record.key, record);
    this.enforceMaxKeys();
  }
  private cleanupExpired(): void {
    const now = Date.now();

    for (const [key, record] of this.map.entries()) {
      if (record.expiresAt <= now) {
        this.map.delete(key);
      }
    }
  }

  private enforceMaxKeys(): void {
    if (this.map.size <= this.maxKeys) return;

    const records = [...this.map.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);

    const excess = this.map.size - this.maxKeys;

    for (let i = 0; i < excess; i++) {
      this.map.delete(records[i][0]);
    }
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}
