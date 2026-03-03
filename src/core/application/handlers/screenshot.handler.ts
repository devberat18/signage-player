import type { Command } from "../../domain/command";
import type { CommandHandler, HandlerResult } from "../command-dispatcher";
import { domainError } from "../../domain/errors";
import type { PlayerEnginePort } from "../../ports/player-engine.port";

export class ScreenshotHandler implements CommandHandler {
  constructor(private readonly player: PlayerEnginePort) {}

  canHandle(command: Command): boolean {
    return command.type === "screenshot";
  }

  async handle(command: Command): Promise<HandlerResult> {
    const p = command.payload as unknown;
    const fmt =
      typeof p === "object" && p !== null && "format" in (p as any)
        ? ((p as any).format as "png" | "jpg" | undefined)
        : undefined;

    try {
      const shot = await this.player.screenshot(fmt);
      return {
        ok: true,
        result: shot,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: domainError("PLATFORM_ERROR", msg, {
          code: "SCREENSHOT_FAILED",
        }),
      };
    }
  }
}
