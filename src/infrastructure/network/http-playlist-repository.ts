import type { PlaylistRepository } from "../../core/ports/playlist-repository.port";
import type { LoggerPort } from "../../core/ports/logger.port";
import {
  validatePlaylistResponseDto,
  mapPlaylistDtoToDomain,
  type Playlist,
  type PlaylistResponseDto,
} from "../../core/domain/playlist";
import { LocalStoragePlaylistCache } from "../storage/playlist-cache.localstorage";
import { BrowserMediaCache } from "../storage/media-cache.browser";

export class HttpPlaylistRepository implements PlaylistRepository {
  private readonly playlistCache: LocalStoragePlaylistCache;
  private readonly mediaCache: BrowserMediaCache;
  private readonly logger?: LoggerPort;

  constructor(
    private readonly endpointUrl: string,
    private readonly timeoutMs: number = 10_000,
    options: {
      cacheNamespace?: string;
      playlistCacheTtlMs?: number;
      playlistCacheMaxBytes?: number;
      mediaCacheTtlMs?: number;
      mediaCacheMaxBytes?: number;
      logger?: LoggerPort;
    } = {},
  ) {
    const ns = options.cacheNamespace ?? "signage";
    this.playlistCache = new LocalStoragePlaylistCache({
      namespace: ns,
      ttlMs: options.playlistCacheTtlMs,
      maxBytes: options.playlistCacheMaxBytes,
    });
    this.mediaCache = new BrowserMediaCache({
      namespace: ns,
      ttlMs: options.mediaCacheTtlMs,
      maxBytes: options.mediaCacheMaxBytes,
      logger: options.logger,
    });
    this.logger = options.logger;
  }

  async getPlaylist(): Promise<Playlist> {
    const online = this.isOnline();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpointUrl, { signal: controller.signal });

      if (!res.ok) {
        throw new Error(`Playlist fetch failed: ${res.status} ${res.statusText}`);
      }

      const rawJson = await res.text();
      const parsedJson: unknown = JSON.parse(rawJson);
      const dto = validatePlaylistResponseDto(parsedJson);
      const hash = this.hash(rawJson);
      const existing = this.playlistCache.get();

      if (!existing || existing.hash !== hash) {
        try {
          this.playlistCache.set({ hash, rawJson });
        } catch (e) {
          this.logger?.warn("Playlist cache write failed", {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      void this.mediaCache.preload(this.collectImageUrls(dto));

      const domain = mapPlaylistDtoToDomain(dto);
      return await this.resolvePlaybackUrls(domain, online);
    } catch (e) {
      const cached = this.playlistCache.get();
      if (!cached) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`Playlist fetch failed and cache is unavailable: ${message}`);
      }

      try {
        const parsedCached: unknown = JSON.parse(cached.rawJson);
        const dto = validatePlaylistResponseDto(parsedCached);
        const domain = mapPlaylistDtoToDomain(dto);
        this.logger?.warn("Using cached playlist", {
          cachedAt: cached.createdAt,
          online,
        });
        return await this.resolvePlaybackUrls(domain, false);
      } catch {
        this.playlistCache.clear();
        throw new Error("Cached playlist is invalid and has been cleared.");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private collectImageUrls(dto: PlaylistResponseDto): string[] {
    const out: string[] = [];
    for (const item of dto.playlist) {
      if (item.type === "image") out.push(item.url);
    }
    return out;
  }

  private async resolvePlaybackUrls(
    playlist: Playlist,
    preferNetwork: boolean,
  ): Promise<Playlist> {
    const items = await Promise.all(
      playlist.items.map(async (item) => {
        if (item.kind !== "image") return item;

        if (preferNetwork) return item;

        const cachedUrl = await this.mediaCache.resolveImageUrl(item.url);
        if (cachedUrl) return { ...item, url: cachedUrl };

        this.logger?.warn("Image not found in media cache", { url: item.url });
        return item;
      }),
    );

    return { items };
  }

  private hash(value: string): string {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fnv1a-${(h >>> 0).toString(16)}`;
  }

  private isOnline(): boolean {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  }
}
