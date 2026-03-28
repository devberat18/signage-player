import type { Command } from "../../domain/command";
import type { CommandHandler, HandlerResult } from "../command-dispatcher";
import type { PlayerEnginePort } from "../../ports/player-engine.port";

export class RestartPlayerHandler implements CommandHandler {
  constructor(private readonly player: PlayerEnginePort) {}

  canHandle(command: Command): boolean {
    return command.type === "restart_player";
  }

  async handle(_command: Command): Promise<HandlerResult> {
    await this.player.restartPlayer();
    return { ok: true, result: { restarted: true } };
  }
}
