import type { PlaylistItem } from "../domain/playlist";

export type RenderResult = { ok: true } | { ok: false; reason: string };

export interface Renderer {
  render(item: PlaylistItem): Promise<RenderResult>;

  onVideoEnded(handler: () => void): void;

  clear(): void;

  pause?(): void | Promise<void>;
  resume?(): void | Promise<void>;
  setVolume?(volume01: number): void | Promise<void>;

  screenshot?(
    format?: "png" | "jpg",
  ): Promise<{ base64: string; format: "image/png" | "image/jpeg" }>;
}
