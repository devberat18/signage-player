import type { PlaylistRepository } from "../application/ports/playlist-repository";
import type { Renderer } from "../application/ports/renderer";
import type { Timer, TimerHandle } from "../application/ports/timer";
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

  private imageTimer: TimerHandle | null = null;
  private consecutiveErrors = 0;

  private listeners = new Set<(ev: EngineEvent) => void>();

  private readonly repo: PlaylistRepository;
  private readonly renderer: Renderer;
  private readonly timer: Timer;
  private readonly options: EngineOptions;

  constructor(
    repo: PlaylistRepository,
    renderer: Renderer,
    timer: Timer,
    options: EngineOptions = { loop: true, maxConsecutiveErrors: 5 }
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
      this.emitLog("info", `Image timer set: ${item.durationMs}ms`);
      this.imageTimer = this.timer.setTimeout(() => {
        this.emitLog("info", "Image duration elapsed -> next()");
        this.next();
      }, item.durationMs);
    }

    if (item.kind === "video") {
      this.emitLog("info", "Video playing... waiting for renderer ended event");
    }
  }

  private handlePlaybackError(reason: string): void {
    this.consecutiveErrors++;

    if (this.consecutiveErrors >= this.options.maxConsecutiveErrors) {
      this.fail(
        `Too many consecutive playback errors (${this.consecutiveErrors}). Last reason: ${reason}`
      );
      return;
    }

    this.emitLog(
      "warn",
      `Skipping item due to error. consecutiveErrors=${this.consecutiveErrors}`
    );
    this.next();
  }

  private fail(message: string): void {
    this.clearImageTimer();
    this.renderer.clear();
    this.setState({ status: "ERROR", message });
    this.emitLog("error", message);
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
}