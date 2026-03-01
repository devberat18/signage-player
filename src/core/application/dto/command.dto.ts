import { isCommandType, type Command } from "../../domain/command";
import { domainError, type DomainError } from "../../domain/errors";

export interface CommandDto {
  command: unknown;
  correlationId: unknown;
  timestamp: unknown;
  payload?: unknown;
}

export function mapDtoToCommand(dto: CommandDto): Command | DomainError {
  if (!isCommandType(dto.command)) {
    return domainError("UNSUPPORTED_COMMAND", "Unsupported command", {
      command: dto.command,
    });
  }
  if (typeof dto.correlationId !== "string" || dto.correlationId.length < 6) {
    return domainError("VALIDATION_ERROR", "Invalid correlationId");
  }
  if (typeof dto.timestamp !== "number") {
    return domainError("VALIDATION_ERROR", "Invalid timestamp");
  }

  return {
    type: dto.command,
    correlationId: dto.correlationId,
    timestamp: dto.timestamp,
    payload: dto.payload,
  } as Command;
}