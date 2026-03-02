import type { Command } from "../../domain/command";
import type { CommandHandler, HandlerResult } from "../command-dispatcher";
import type { PlayerEnginePort } from "../../ports/player-engine.port";

export class PlayHandler implements CommandHandler {
  constructor(private readonly player: PlayerEnginePort) {}

  canHandle(command: Command): boolean {
    return command.type === "play";
  }

  async handle(): Promise<HandlerResult> {
    await this.player.play();
    return { ok: true, result: { playing: true } };
  }
}