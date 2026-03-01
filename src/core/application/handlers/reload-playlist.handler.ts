import type { Command } from "../../domain/command";
import type { CommandHandler, HandlerResult } from "../command-dispatcher";
import type { PlayerEnginePort } from "../../ports/player-engine.port";

export class ReloadPlaylistHandler implements CommandHandler {
  constructor(private readonly player: PlayerEnginePort) {}

  canHandle(command: Command): boolean {
    return command.type === "reload_playlist";
  }

  async handle(): Promise<HandlerResult> {
    await this.player.reloadPlaylist();
    return { ok: true, result: { reloaded: true } };
  }
}