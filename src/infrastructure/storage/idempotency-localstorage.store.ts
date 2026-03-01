import type {
  IdempotencyRecord,
  IdempotencyStorePort,
} from "../../core/ports/idempotency-store.port";

type StoredRecord<T> = IdempotencyRecord<T>;

export class LocalStorageIdempotencyStore<T>
  implements IdempotencyStorePort<T>
{
  private readonly prefix: string;
  private readonly maxKeys: number;

  constructor(options: { namespace: string; maxKeys?: number }) {
    this.prefix = `${options.namespace}:`;
    this.maxKeys = options.maxKeys ?? 500;
  }

  async get(key: string): Promise<IdempotencyRecord<T> | null> {
    const raw = localStorage.getItem(this.k(key));
    if (!raw) return null;

    try {
      const rec = JSON.parse(raw) as StoredRecord<T>;
      if (Date.now() > rec.expiresAt) {
        localStorage.removeItem(this.k(key));
        return null;
      }
      return rec;
    } catch {
      localStorage.removeItem(this.k(key));
      return null;
    }
  }

  async set(record: IdempotencyRecord<T>): Promise<void> {
    localStorage.setItem(this.k(record.key), JSON.stringify(record));
    this.cleanupExpired();
    this.enforceMaxKeys();
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(this.k(key));
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const keys = this.listKeys();
    for (const storageKey of keys) {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw) as StoredRecord<T>;
        if (now > rec.expiresAt) localStorage.removeItem(storageKey);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  }

  private enforceMaxKeys(): void {
    const keys = this.listKeys();
    if (keys.length <= this.maxKeys) return;

    const records: Array<{ storageKey: string; createdAt: number }> = [];

    for (const storageKey of keys) {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw) as StoredRecord<T>;
        records.push({ storageKey, createdAt: rec.createdAt });
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    records.sort((a, b) => a.createdAt - b.createdAt);

    const toDelete = records.length - this.maxKeys;
    for (let i = 0; i < toDelete; i++) {
      localStorage.removeItem(records[i].storageKey);
    }
  }

  private listKeys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(this.prefix)) out.push(k);
    }
    return out;
  }
}