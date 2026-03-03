import type { LoggerPort } from "../../core/ports/logger.port";

type MediaEntry = {
  cachedAt: number;
  size: number;
};

type MediaMeta = {
  entries: Record<string, MediaEntry>;
};

export class BrowserMediaCache {
  private readonly cacheName: string;
  private readonly metaKey: string;
  private readonly ttlMs: number;
  private readonly maxBytes: number;
  private readonly logger?: LoggerPort;

  constructor(
    options: {
      namespace: string;
      ttlMs?: number;
      maxBytes?: number;
      logger?: LoggerPort;
    },
  ) {
    this.cacheName = `${options.namespace}:media`;
    this.metaKey = `${options.namespace}:media:meta`;
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxBytes = options.maxBytes ?? 80 * 1024 * 1024;
    this.logger = options.logger;
  }

  async preload(urls: string[]): Promise<void> {
    if (!("caches" in globalThis)) return;

    const uniq = Array.from(new Set(urls.filter((u) => typeof u === "string" && u.length > 0)));
    if (!uniq.length) return;

    for (const url of uniq) {
      await this.fetchAndCache(url);
    }
  }

  async resolveImageUrl(url: string): Promise<string | null> {
    if (!("caches" in globalThis)) return null;

    const cache = await caches.open(this.cacheName);
    const meta = this.loadMeta();
    const entry = meta.entries[url];

    if (!entry) return null;

    if (Date.now() - entry.cachedAt > this.ttlMs) {
      await cache.delete(url);
      delete meta.entries[url];
      this.saveMeta(meta);
      return null;
    }

    const response = await cache.match(url);
    if (!response) {
      delete meta.entries[url];
      this.saveMeta(meta);
      return null;
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  private async fetchAndCache(url: string): Promise<void> {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        this.logger?.warn("Media preload failed", { url, status: response.status });
        return;
      }

      const blob = await response.clone().blob();
      const size = blob.size;

      const cache = await caches.open(this.cacheName);
      await cache.put(url, response);

      const meta = this.loadMeta();
      meta.entries[url] = { cachedAt: Date.now(), size };
      await this.enforceLimits(cache, meta);
      this.saveMeta(meta);
    } catch (e) {
      this.logger?.warn("Media preload failed", {
        url,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async enforceLimits(cache: Cache, meta: MediaMeta): Promise<void> {
    const now = Date.now();
    for (const [url, entry] of Object.entries(meta.entries)) {
      if (now - entry.cachedAt > this.ttlMs) {
        await cache.delete(url);
        delete meta.entries[url];
      }
    }

    let total = this.totalBytes(meta);
    if (total <= this.maxBytes) return;

    const ordered = Object.entries(meta.entries).sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt,
    );

    for (const [url, entry] of ordered) {
      await cache.delete(url);
      delete meta.entries[url];
      total -= entry.size;
      if (total <= this.maxBytes) break;
    }
  }

  private loadMeta(): MediaMeta {
    const raw = localStorage.getItem(this.metaKey);
    if (!raw) return { entries: {} };

    try {
      const parsed = JSON.parse(raw) as MediaMeta;
      if (!parsed || typeof parsed !== "object" || typeof parsed.entries !== "object") {
        localStorage.removeItem(this.metaKey);
        return { entries: {} };
      }
      return parsed;
    } catch {
      localStorage.removeItem(this.metaKey);
      return { entries: {} };
    }
  }

  private saveMeta(meta: MediaMeta): void {
    try {
      localStorage.setItem(this.metaKey, JSON.stringify(meta));
    } catch {
      this.logger?.warn("Media cache metadata write failed");
    }
  }

  private totalBytes(meta: MediaMeta): number {
    let total = 0;
    for (const entry of Object.values(meta.entries)) total += entry.size;
    return total;
  }
}
