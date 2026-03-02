import type { Command } from "../../domain/command";
import type { CommandHandler, HandlerResult } from "../command-dispatcher";
import type { PlayerEnginePort } from "../../ports/player-engine.port";

export class SetVolumeHandler implements CommandHandler {
  constructor(private readonly player: PlayerEnginePort) {}

  canHandle(command: Command): boolean {
    return command.type === "set_volume";
  }

  async handle(command: Command): Promise<HandlerResult> {
    const volume = (command.payload as { volume: number }).volume;

    await this.player.setVolume(volume);
    return { ok: true, result: { volume } };
  }
}