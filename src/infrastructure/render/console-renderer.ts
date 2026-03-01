import type { Renderer, RenderResult } from "../../core/ports/renderer.port";
import type { PlaylistItem } from "../../core/domain/playlist";

export class ConsoleRenderer implements Renderer {
  private videoEndedHandler: (() => void) | null = null;

  async render(item: PlaylistItem): Promise<RenderResult> {
    if (item.kind === "image") {
      console.log(`[RENDER] IMAGE url=${item.url} durationMs=${item.durationMs}`);
      return { ok: true };
    }

    console.log(`[RENDER] VIDEO url=${item.url} (waiting for ended event from renderer)`);
    return { ok: true };
  }

  onVideoEnded(handler: () => void): void {
    this.videoEndedHandler = handler;
  }

  clear(): void {}

  public debugTriggerVideoEnded(): void {
    if (this.videoEndedHandler) this.videoEndedHandler();
  }
}