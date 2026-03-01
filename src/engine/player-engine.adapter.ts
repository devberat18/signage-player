import type { PlayerEnginePort } from "../core/ports/player-engine.port";
import type { PlayerEngine } from "./player-engine";

export class PlayerEngineAdapter implements PlayerEnginePort {
  constructor(private readonly engine: PlayerEngine) {}

  async reloadPlaylist(): Promise<void> {
    await this.engine.reloadPlaylist();
  }

  async play(): Promise<void> {
    await (this.engine as any).play?.();
  }

  async pause(): Promise<void> {
    await (this.engine as any).pause?.();
  }

  async restartPlayer(): Promise<void> {
    await (this.engine as any).restart?.();
  }

  async setVolume(volume: number): Promise<void> {
    await (this.engine as any).setVolume?.(volume);
  }

  async screenshot(format?: "png" | "jpg"): Promise<{ imageUrl?: string }> {
    const res = await (this.engine as any).screenshot?.(format);
    return res ?? {};
  }
}
