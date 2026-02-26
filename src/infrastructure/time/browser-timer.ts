import type { Timer, TimerHandle } from "../../application/ports/timer";

export class BrowserTimer implements Timer {
  setTimeout(handler: () => void, delayMs: number): TimerHandle {
    return window.setTimeout(handler, delayMs);
  }

  clearTimeout(handle: TimerHandle): void {
    window.clearTimeout(handle);
  }
}