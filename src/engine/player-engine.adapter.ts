import type { PlayerEnginePort } from "../core/ports/player-engine.port";
import type { PlayerEngine } from "./player-engine";

type VolumeCapable = { setVolume(volume: number): Promise<void> };
type ScreenshotCapable = {
  screenshot(format?: "png" | "jpg"): Promise<{ imageUrl?: string }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function hasSetVolume(engine: unknown): engine is VolumeCapable {
  return isRecord(engine) && typeof engine["setVolume"] === "function";
}
function hasScreenshot(engine: unknown): engine is ScreenshotCapable {
  return isRecord(engine) && typeof engine["screenshot"] === "function";
}

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

  async screenshot(format?: "png" | "jpg"): Promise<{ imageUrl?: string }> {
    if (!hasScreenshot(this.engine)) {
      return {};
    }
    return await this.engine.screenshot(format);
  }
}
