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
    let fmt: "png" | "jpg" | undefined;

    if (typeof p === "object" && p !== null && "format" in p) {
      const rawFormat = (p as Record<string, unknown>).format;
      if (rawFormat === "png" || rawFormat === "jpg") {
        fmt = rawFormat;
      }
    }

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
