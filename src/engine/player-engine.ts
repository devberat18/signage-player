import type { PlaylistRepository } from "../core/ports/playlist-repository.port";
import type { Renderer } from "../core/ports/renderer.port";
import type { Timer, TimerHandle } from "../core/ports/timer.port";
import type { Playlist, PlaylistItem } from "../core/domain/playlist";

type EngineState =
  | { status: "IDLE" }
  | { status: "LOADING_PLAYLIST" }
  | { status: "PLAYING"; index: number; item: PlaylistItem }
  | { status: "ERROR"; message: string };

export type EngineEvent =
  | { type: "STATE_CHANGED"; state: EngineState }
  | { type: "LOG"; level: "info" | "warn" | "error"; message: string };

type EngineOptions = {
  loop: boolean;
  maxConsecutiveErrors: number;
};

export class PlayerEngine {
  private state: EngineState = { status: "IDLE" };
  private playlist: Playlist | null = null;
  private currentIndex = 0;
  private paused = false;
  private imageTimer: TimerHandle | null = null;
  private consecutiveErrors = 0;

  private listeners = new Set<(ev: EngineEvent) => void>();

  private readonly repo: PlaylistRepository;
  private readonly renderer: Renderer;
  private readonly timer: Timer;
  private readonly options: EngineOptions;

  private currentImageDurationMs: number | null = null;
  private currentImageStartedAt: number | null = null;
  private remainingImageMs: number | null = null;
  private volume01: number = 0;

  constructor(
    repo: PlaylistRepository,
    renderer: Renderer,
    timer: Timer,
    options: EngineOptions = { loop: true, maxConsecutiveErrors: 5 },
  ) {
    this.repo = repo;
    this.renderer = renderer;
    this.timer = timer;
    this.options = options;

    this.renderer.onVideoEnded(() => {
      this.emitLog("info", "Video ended -> next()");
      this.next();
    });
  }

  onEvent(listener: (ev: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.state.status !== "IDLE") return;

    this.setState({ status: "LOADING_PLAYLIST" });
    this.emitLog("info", "Fetching playlist...");

    try {
      const playlist = await this.repo.getPlaylist();
      if (!playlist.items.length) {
        this.fail(`Playlist is empty.`);
        return;
      }

      this.playlist = playlist;
      this.currentIndex = 0;
      this.consecutiveErrors = 0;

      this.emitLog("info", `Playlist loaded. items=${playlist.items.length}`);
      await this.playCurrent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.fail(`Playlist fetch/parse failed: ${msg}`);
    }
  }

  stop(): void {
    this.clearImageTimer();
    this.renderer.clear();
    this.playlist = null;
    this.currentIndex = 0;
    this.consecutiveErrors = 0;
    this.setState({ status: "IDLE" });
    this.emitLog("info", "Engine stopped.");
  }

  next(): void {
    if (this.paused) {
      this.emitLog("info", "next() ignored because paused=true");
      return;
    }
    if (!this.playlist) return;

    this.clearImageTimer();
    this.renderer.clear();

    const lastIndex = this.playlist.items.length - 1;

    if (this.currentIndex >= lastIndex) {
      if (!this.options.loop) {
        this.emitLog("info", "Reached end of playlist. loop=false -> stop()");
        this.stop();
        return;
      }
      this.currentIndex = 0;
      this.emitLog("info", "Reached end of playlist. loop=true -> index=0");
    } else {
      this.currentIndex++;
    }

    void this.playCurrent();
  }

  async setVolume(volume: number): Promise<void> {
    this.volume01 = Math.min(1, Math.max(0, volume / 100));
    await this.renderer.setVolume?.(this.volume01);
    this.emitLog("info", `Volume set: ${volume} (${this.volume01})`);
  }

  private async playCurrent(): Promise<void> {
    if (!this.playlist) return;

    const item = this.playlist.items[this.currentIndex];
    this.setState({ status: "PLAYING", index: this.currentIndex, item });

    const result = await this.renderer.render(item);

    if (!result.ok) {
      this.emitLog("warn", `Render failed: ${result.reason}`);
      this.handlePlaybackError(result.reason);
      return;
    }

    this.consecutiveErrors = 0;

    if (item.kind === "image") {
      this.currentImageDurationMs = item.durationMs;
      this.currentImageStartedAt = Date.now();
      this.remainingImageMs = item.durationMs;

      this.emitLog("info", `Image timer set: ${item.durationMs}ms`);
      this.imageTimer = this.timer.setTimeout(() => {
        this.emitLog("info", "Image duration elapsed -> next()");
        this.next();
      }, item.durationMs);
    } else {
      this.currentImageDurationMs = null;
      this.currentImageStartedAt = null;
      this.remainingImageMs = null;
    }
  }

  private handlePlaybackError(reason: string): void {
    this.consecutiveErrors++;

    if (this.consecutiveErrors >= this.options.maxConsecutiveErrors) {
      this.fail(
        `Too many consecutive playback errors (${this.consecutiveErrors}). Last reason: ${reason}`,
      );
      return;
    }

    this.emitLog(
      "warn",
      `Skipping item due to error. consecutiveErrors=${this.consecutiveErrors}`,
    );
    this.next();
  }

  private fail(message: string): void {
    this.clearImageTimer();
    this.renderer.clear();
    this.setState({ status: "ERROR", message });
    this.emitLog("error", message);
  }

  async pause(): Promise<void> {
    if (this.paused) return;

    this.paused = true;

    if (
      this.currentImageDurationMs !== null &&
      this.currentImageStartedAt !== null
    ) {
      const elapsed = Date.now() - this.currentImageStartedAt;
      const remaining = Math.max(0, this.currentImageDurationMs - elapsed);

      this.remainingImageMs = remaining;
      this.clearImageTimer();
      this.emitLog("info", `Paused image. remainingMs=${remaining}`);
      return;
    }

    await this.renderer.pause?.();
    this.emitLog("info", "Paused video (if supported).");
  }

  async play(): Promise<void> {
    if (!this.paused) return;

    this.paused = false;

    if (this.remainingImageMs !== null) {
      const remaining = this.remainingImageMs;
      this.remainingImageMs = null;
      this.currentImageStartedAt = Date.now();

      this.emitLog("info", `Resuming image. remainingMs=${remaining}`);
      this.imageTimer = this.timer.setTimeout(() => {
        this.emitLog("info", "Image remaining elapsed -> next()");
        this.next();
      }, remaining);
      return;
    }

    await this.renderer.resume?.();
    this.emitLog("info", "Resumed video (if supported).");
  }

  async restartPlayer(): Promise<void> {
    this.emitLog("info", "Soft restart requested.");
    this.paused = false;
    this.stop();
    await this.start();
  }

  private clearImageTimer(): void {
    if (this.imageTimer !== null) {
      this.timer.clearTimeout(this.imageTimer);
      this.imageTimer = null;
    }
  }

  private setState(state: EngineState): void {
    this.state = state;
    this.emit({ type: "STATE_CHANGED", state });
  }

  private emitLog(level: "info" | "warn" | "error", message: string): void {
    this.emit({ type: "LOG", level, message });
  }

  private emit(ev: EngineEvent): void {
    for (const l of this.listeners) l(ev);
  }

  async reloadPlaylist(): Promise<void> {
    this.emitLog("info", "Reloading playlist...");

    try {
      const playlist = await this.repo.getPlaylist();
      if (!playlist.items.length) {
        this.emitLog(
          "warn",
          "Reloaded playlist is empty. Keeping current playlist.",
        );
        return;
      }

      this.playlist = playlist;
      this.currentIndex = 0;
      this.consecutiveErrors = 0;

      this.clearImageTimer();
      this.renderer.clear();

      this.emitLog("info", `Playlist reloaded. items=${playlist.items.length}`);
      await this.playCurrent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emitLog("warn", `Playlist reload failed: ${msg}`);
    }
  }

  async screenshot(
    format: "png" | "jpg" = "png",
  ): Promise<{ format: "image/png" | "image/jpeg"; base64: string }> {
    const r = this.renderer as any;
    if (typeof r.screenshot === "function") {
      return await r.screenshot(format);
    }

    throw new Error("Renderer does not support screenshot");
  }
}
