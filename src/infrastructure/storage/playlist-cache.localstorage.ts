type PlaylistCacheRecord = {
  hash: string;
  rawJson: string;
  createdAt: number;
  expiresAt: number;
};

export class LocalStoragePlaylistCache {
  private readonly key: string;
  private readonly ttlMs: number;
  private readonly maxBytes: number;

  constructor(options: { namespace: string; ttlMs?: number; maxBytes?: number }) {
    this.key = `${options.namespace}:playlist`;
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxBytes = options.maxBytes ?? 512 * 1024;
  }

  get(): PlaylistCacheRecord | null {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as PlaylistCacheRecord;
      if (
        typeof parsed.hash !== "string" ||
        typeof parsed.rawJson !== "string" ||
        typeof parsed.createdAt !== "number" ||
        typeof parsed.expiresAt !== "number"
      ) {
        localStorage.removeItem(this.key);
        return null;
      }

      if (Date.now() > parsed.expiresAt) {
        localStorage.removeItem(this.key);
        return null;
      }

      return parsed;
    } catch {
      localStorage.removeItem(this.key);
      return null;
    }
  }

  set(input: { hash: string; rawJson: string }): void {
    if (this.byteLength(input.rawJson) > this.maxBytes) return;

    const now = Date.now();
    const record: PlaylistCacheRecord = {
      hash: input.hash,
      rawJson: input.rawJson,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    try {
      localStorage.setItem(this.key, JSON.stringify(record));
    } catch {
      localStorage.removeItem(this.key);
      throw new Error("Playlist cache write failed (quota exceeded).");
    }
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }

  private byteLength(value: string): number {
    return new TextEncoder().encode(value).length;
  }
}
