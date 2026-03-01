import type { Playlist } from "../domain/playlist";

export interface PlaylistRepository {
  getPlaylist(): Promise<Playlist>;
}