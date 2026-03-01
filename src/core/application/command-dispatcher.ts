import type { Command } from "../domain/command";
import type { DomainError } from "../domain/errors";

export type HandlerResult = { ok: true; result?: unknown } | { ok: false; error: DomainError };

export interface CommandHandler {
  canHandle(command: Command): boolean;
  handle(command: Command): Promise<HandlerResult>;
}

export class CommandDispatcher {
  constructor(private readonly handlers: CommandHandler[]) {}

  async dispatch(command: Command): Promise<HandlerResult> {
    const handler = this.handlers.find((h) => h.canHandle(command));
    if (!handler) {
      return {
        ok: false,
        error: { code: "UNSUPPORTED_COMMAND", message: "No handler for command" },
      };
    }
    return handler.handle(command);
  }
}