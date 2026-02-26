import type { PlaylistItem } from "../../core/domain/playlist";

export type RenderResult =
  | { ok: true }
  | { ok: false; reason: string };


export interface Renderer {
  render(item: PlaylistItem): Promise<RenderResult>;

  onVideoEnded(handler: () => void): void;

  clear(): void;
}