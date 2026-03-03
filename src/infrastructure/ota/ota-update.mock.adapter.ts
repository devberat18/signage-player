import type { OtaUpdatePort, OtaUpdateResult } from "../../core/ports/ota-update.port";
import type { LoggerPort } from "../../core/ports/logger.port";

/**
 * Mock OTA update adapter.
 *
 * In production this would:
 *  1. Download the bundle from `url`
 *  2. Verify the checksum
 *  3. Write the bundle to persistent storage
 *  4. Schedule a platform reload (e.g. tizen.application.getCurrentApplication().exit())
 *
 * The mock logs the intent and returns immediately with status "scheduled".
 */
export class MockOtaUpdateAdapter implements OtaUpdatePort {
  constructor(private readonly logger?: LoggerPort) {}

  async applyUpdate(url: string, version: string): Promise<OtaUpdateResult> {
    this.logger?.info("OTA update scheduled (mock — no actual download performed)", {
      url,
      version,
    });
    return { version, status: "scheduled" };
  }
}
