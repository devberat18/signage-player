import type { Command, SetVolumeCommand } from "../../domain/command";
import { domainError, type DomainError } from "../../domain/errors";

export function validateCommand(command: Command): Command | DomainError {
  switch (command.type) {
    case "set_volume":
      return validateSetVolume(command);

    case "reload_playlist":
    case "restart_player":
    case "play":
    case "pause":
      if (command.payload !== undefined) {
        return domainError(
          "VALIDATION_ERROR",
          "Payload is not allowed for this command",
        );
      }
      return command;

    case "screenshot": {
      if (command.payload === undefined) return command;

      const p = command.payload as unknown;
      if (typeof p !== "object" || p === null) {
        return domainError(
          "VALIDATION_ERROR",
          "screenshot.payload must be an object",
        );
      }

      const fmt = (p as Record<string, unknown>).format;
      if (fmt !== undefined && fmt !== "png" && fmt !== "jpg") {
        return domainError(
          "VALIDATION_ERROR",
          "screenshot.payload.format must be png or jpg",
        );
      }

      return { ...command, payload: { format: fmt } };
    }

    case "ota_update": {
      const p = command.payload as unknown;
      if (typeof p !== "object" || p === null) {
        return domainError("VALIDATION_ERROR", "ota_update.payload must be an object");
      }

      const { url, version } = p as Record<string, unknown>;

      if (typeof url !== "string" || url.trim().length === 0) {
        return domainError(
          "VALIDATION_ERROR",
          "ota_update.payload.url must be a non-empty string",
        );
      }

      if (typeof version !== "string" || version.trim().length === 0) {
        return domainError(
          "VALIDATION_ERROR",
          "ota_update.payload.version must be a non-empty string",
        );
      }

      return { ...command, payload: { url: url.trim(), version: version.trim() } };
    }

    default:
      return command;
  }
}

function validateSetVolume(
  command: SetVolumeCommand,
): SetVolumeCommand | DomainError {
  const p = command.payload as unknown;

  if (typeof p !== "object" || p === null) {
    return domainError(
      "VALIDATION_ERROR",
      "set_volume.payload must be an object",
    );
  }

  const vol = (p as Record<string, unknown>).volume;

  if (typeof vol !== "number" || !Number.isFinite(vol)) {
    return domainError(
      "VALIDATION_ERROR",
      "set_volume.payload.volume must be a finite number",
    );
  }

  if (vol < 0 || vol > 100) {
    return domainError(
      "VALIDATION_ERROR",
      "set_volume.payload.volume must be between 0 and 100",
    );
  }

  return { ...command, payload: { volume: vol } };
}
