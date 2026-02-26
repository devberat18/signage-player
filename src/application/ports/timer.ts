export type TimerHandle = number;

export interface Timer {
  setTimeout(handler: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}