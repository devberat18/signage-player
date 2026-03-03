import type { Renderer, RenderResult } from "../../core/ports/renderer.port";
import type { PlaylistItem } from "../../core/domain/playlist";

type Slot = {
  root: HTMLDivElement;
  element: HTMLElement | null;
};

type ScreenshotExt = "png" | "jpg";
type ScreenshotMime = "image/png" | "image/jpeg";

export class DomRenderer implements Renderer {
  private container: HTMLElement;
  private videoEndedHandler: (() => void) | null = null;
  private volume01: number = 0;

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

  pause(): void {
    const el = this.active.element;
    if (el instanceof HTMLVideoElement) el.pause();
  }

  resume(): void {
    const el = this.active.element;
    if (el instanceof HTMLVideoElement) void el.play();
  }

  setVolume(volume01: number): void {
    this.volume01 = Math.min(1, Math.max(0, volume01));

    const el = this.active.element;
    if (el instanceof HTMLVideoElement) {
      el.volume = this.volume01;
      el.muted = this.volume01 === 0;
    }
  }

  async render(item: PlaylistItem): Promise<RenderResult> {
    try {
      this.disposeSlot(this.inactive);

      if (item.kind === "image") {
        const img = document.createElement("img");
        img.crossOrigin = "anonymous";

        img.src = item.url;
        this.applyMediaStyles(img);

        this.inactive.root.appendChild(img);
        this.inactive.element = img;

        await this.waitImageReady(img);
      } else {
        const video = document.createElement("video");
        (video as any).crossOrigin = "anonymous";

        video.src = item.url;
        video.autoplay = true;
        video.playsInline = true;

        video.volume = this.volume01;
        video.muted = this.volume01 === 0;

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

  async screenshot(
    format: ScreenshotExt = "png",
  ): Promise<{ base64: string; format: ScreenshotMime }> {
    const el = this.active.element;
    if (!el) throw new Error("No active media element to screenshot");
    return this.toBase64FromElement(el, format);
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
    if (slot.element instanceof HTMLImageElement) {
      const src = slot.element.src;
      if (src.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(src);
        } catch {}
      }
    }

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

  private toBase64FromElement(
    el: HTMLElement,
    format: ScreenshotExt,
  ): { base64: string; format: ScreenshotMime } {
    const w = this.container.clientWidth || 1280;
    const h = this.container.clientHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available");

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);

    if (el instanceof HTMLVideoElement) {
      ctx.drawImage(el, 0, 0, w, h);
    } else if (el instanceof HTMLImageElement) {
      ctx.drawImage(el, 0, 0, w, h);
    } else {
      throw new Error("Active element is not image/video");
    }

    const mime = format === "jpg" ? "image/jpeg" : "image/png";

    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL(mime, format === "jpg" ? 0.9 : undefined);
    } catch {
      throw new Error(
        "Screenshot failed (CORS/tainted canvas). Media must be same-origin or served with Access-Control-Allow-Origin.",
      );
    }

    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) throw new Error("Screenshot failed: empty base64 output");

    return { base64, format: mime };
  }
}
