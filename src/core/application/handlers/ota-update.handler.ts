import type { Command, OtaUpdateCommand } from "../../domain/command";
import type { CommandHandler, HandlerResult } from "../command-dispatcher";
import { domainError } from "../../domain/errors";
import type { OtaUpdatePort } from "../../ports/ota-update.port";

export class OtaUpdateHandler implements CommandHandler {
  constructor(private readonly ota: OtaUpdatePort) {}

  canHandle(command: Command): boolean {
    return command.type === "ota_update";
  }

  async handle(command: Command): Promise<HandlerResult> {
    const cmd = command as OtaUpdateCommand;
    const { url, version } = cmd.payload;

    try {
      const result = await this.ota.applyUpdate(url, version);
      return { ok: true, result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: domainError("PLATFORM_ERROR", msg, { code: "OTA_FAILED" }),
      };
    }
  }
}
