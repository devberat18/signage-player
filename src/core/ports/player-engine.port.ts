export interface PlayerEnginePort {
  reloadPlaylist(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  restartPlayer(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  screenshot(
    format?: "png" | "jpg",
  ): Promise<{ format: "image/png" | "image/jpeg"; base64: string }>;
}
