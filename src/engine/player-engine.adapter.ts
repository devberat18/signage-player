import type { PlayerEnginePort } from "../core/ports/player-engine.port";
import type { PlayerEngine } from "./player-engine";

export class PlayerEngineAdapter implements PlayerEnginePort {
  constructor(private readonly engine: PlayerEngine) {}

  async reloadPlaylist(): Promise<void> {
    await this.engine.reloadPlaylist();
  }

  async play(): Promise<void> {
    await this.engine.play();
  }

  async pause(): Promise<void> {
    await this.engine.pause();
  }

  async restartPlayer(): Promise<void> {
    await this.engine.restartPlayer();
  }

  async setVolume(volume: number): Promise<void> {
    await this.engine.setVolume(volume);
  }

  async screenshot(
    format?: "png" | "jpg",
  ): Promise<{ format: "image/png" | "image/jpeg"; base64: string }> {
    return await this.engine.screenshot(format);
  }
}
