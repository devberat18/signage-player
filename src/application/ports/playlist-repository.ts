import type { Playlist } from "../../core/domain/playlist";

export interface PlaylistRepository {
  getPlaylist(): Promise<Playlist>;
}