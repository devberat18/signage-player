export type CorrelationId = string;

export type CommandType =
  | "reload_playlist"
  | "restart_player"
  | "play"
  | "pause"
  | "set_volume"
  | "screenshot"
  | "ota_update";

export interface BaseCommand<TPayload = unknown> {
  type: CommandType;
  correlationId: CorrelationId;
  timestamp: number;
  payload?: TPayload;
}

export interface SetVolumePayload {
  volume: number;
}

export interface ScreenshotPayload {
  format?: "png" | "jpg";
}

export interface OtaUpdatePayload {
  url: string;
  version: string;
}

export type ReloadPlaylistCommand = BaseCommand<undefined> & { type: "reload_playlist" };
export type RestartPlayerCommand = BaseCommand<undefined> & { type: "restart_player" };
export type PlayCommand = BaseCommand<undefined> & { type: "play" };
export type PauseCommand = BaseCommand<undefined> & { type: "pause" };
export type SetVolumeCommand = BaseCommand<SetVolumePayload> & { type: "set_volume" };
export type ScreenshotCommand = BaseCommand<ScreenshotPayload> & { type: "screenshot" };
export type OtaUpdateCommand = BaseCommand<OtaUpdatePayload> & { type: "ota_update" };

export type Command =
  | ReloadPlaylistCommand
  | RestartPlayerCommand
  | PlayCommand
  | PauseCommand
  | SetVolumeCommand
  | ScreenshotCommand
  | OtaUpdateCommand;


export function isCommandType(value: unknown): value is CommandType {
  return (
    value === "reload_playlist" ||
    value === "restart_player" ||
    value === "play" ||
    value === "pause" ||
    value === "set_volume" ||
    value === "screenshot" ||
    value === "ota_update"
  );
}