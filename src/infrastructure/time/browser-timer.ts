import type { Timer, TimerHandle } from "../../core/ports/timer.port";

export class BrowserTimer implements Timer {
  setTimeout(handler: () => void, delayMs: number): TimerHandle {
    return window.setTimeout(handler, delayMs);
  }

  clearTimeout(handle: TimerHandle): void {
    window.clearTimeout(handle);
  }
}