import type { IdempotencyStorePort, IdempotencyRecord } from "../../core/ports/idempotency-store.port";

export class MemoryIdempotencyStore<T> implements IdempotencyStorePort<T> {
  private map = new Map<string, IdempotencyRecord<T>>();

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
    this.map.set(record.key, record);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}