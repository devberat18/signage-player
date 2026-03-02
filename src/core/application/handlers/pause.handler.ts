import type { Command } from "../../domain/command";
import type { CommandHandler, HandlerResult } from "../command-dispatcher";
import type { PlayerEnginePort } from "../../ports/player-engine.port";

export class PauseHandler implements CommandHandler {
  constructor(private readonly player: PlayerEnginePort) {}

  canHandle(command: Command): boolean {
    return command.type === "pause";
  }

  async handle(): Promise<HandlerResult> {
    await this.player.pause();
    return { ok: true, result: { paused: true } };
  }
}