import type { Renderer, RenderResult } from "../../core/ports/renderer.port";
import type { PlaylistItem } from "../../core/domain/playlist";

type Slot = {
  root: HTMLDivElement;
  element: HTMLElement | null;
};

export class DomRenderer implements Renderer {
  private container: HTMLElement;
  private videoEndedHandler: (() => void) | null = null;

  private a: Slot;
  private b: Slot;
  private active: Slot;
  private inactive: Slot;

  constructor(containerId: string = "app") {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container element #${containerId} not found`);
    this.container = el;

    this.container.style.position = "relative";
    this.container.style.width = "100vw";
    this.container.style.height = "100vh";
    this.container.style.overflow = "hidden";
    this.container.style.backgroundColor = "black";

    this.a = { root: this.createLayer(), element: null };
    this.b = { root: this.createLayer(), element: null };

    this.container.appendChild(this.a.root);
    this.container.appendChild(this.b.root);

    this.active = this.a;
    this.inactive = this.b;

    this.active.root.style.opacity = "1";
    this.inactive.root.style.opacity = "0";
  }

  onVideoEnded(handler: () => void): void {
    this.videoEndedHandler = handler;
  }

  clear(): void {
    this.disposeSlot(this.a);
    this.disposeSlot(this.b);
    this.a.root.style.opacity = "1";
    this.b.root.style.opacity = "0";
    this.active = this.a;
    this.inactive = this.b;
  }

  async render(item: PlaylistItem): Promise<RenderResult> {
    try {
      this.disposeSlot(this.inactive);

      if (item.kind === "image") {
        const img = document.createElement("img");
        img.src = item.url;
        this.applyMediaStyles(img);
        this.inactive.root.appendChild(img);
        this.inactive.element = img;

        await this.waitImageReady(img);
      } else {
        const video = document.createElement("video");
        video.src = item.url;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        this.applyMediaStyles(video);

        video.onended = () => this.videoEndedHandler?.();
        video.onerror = () => console.error("Video failed to load:", item.url);

        this.inactive.root.appendChild(video);
        this.inactive.element = video;

        await this.waitVideoReady(video);
      }

      this.swapLayers();

      this.disposeSlot(this.inactive);

      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  private createLayer(): HTMLDivElement {
    const layer = document.createElement("div");
    layer.style.position = "absolute";
    layer.style.top = "0";
    layer.style.left = "0";
    layer.style.width = "100%";
    layer.style.height = "100%";
    layer.style.transition = "opacity 150ms linear";
    return layer;
  }

  private applyMediaStyles(el: HTMLElement): void {
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "100%";
    el.style.height = "100%";

    (el as any).style.objectFit = "cover";
  }

  private swapLayers(): void {
    this.inactive.root.style.opacity = "1";
    this.active.root.style.opacity = "0";

    const tmp = this.active;
    this.active = this.inactive;
    this.inactive = tmp;
  }

  private disposeSlot(slot: Slot): void {
    if (slot.element instanceof HTMLVideoElement) {
      slot.element.pause();
      slot.element.removeAttribute("src");
      slot.element.load();
    }
    slot.root.innerHTML = "";
    slot.element = null;
  }

  private waitImageReady(img: HTMLImageElement): Promise<void> {
    return new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image failed to load"));
    });
  }

  private waitVideoReady(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      // readyState:
      // 0 = HAVE_NOTHING
      // 1 = HAVE_METADATA
      // 2 = HAVE_CURRENT_DATA (first frame data)
      // 3 = HAVE_FUTURE_DATA
      // 4 = HAVE_ENOUGH_DATA

      if (video.readyState >= 2) return resolve();

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Video failed to load"));
      };

      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Video load timeout"));
      }, 8000);

      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onError);
      };

      video.addEventListener("loadeddata", onReady);

      video.addEventListener("canplay", onReady);

      video.addEventListener("error", onError);
    });
  }
}
