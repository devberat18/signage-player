import type { PlaylistRepository } from "../../core/ports/playlist-repository.port";
import {
  validatePlaylistResponseDto,
  mapPlaylistDtoToDomain,
  type Playlist,
} from "../../core/domain/playlist";

export class HttpPlaylistRepository implements PlaylistRepository {
  constructor(
    private readonly endpointUrl: string,
    private readonly timeoutMs: number = 10_000
  ) {}

  async getPlaylist(): Promise<Playlist> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpointUrl, { signal: controller.signal });

      if (!res.ok) {
        throw new Error(`Playlist fetch failed: ${res.status} ${res.statusText}`);
      }

      const json: unknown = await res.json();
      const dto = validatePlaylistResponseDto(json);
      return mapPlaylistDtoToDomain(dto);
    } finally {
      clearTimeout(timer);
    }
  }
}