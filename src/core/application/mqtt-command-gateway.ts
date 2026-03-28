import type { MqttClientPort } from "../ports/mqtt-client.port";
import type { LoggerPort } from "../ports/logger.port";
import type { IdempotencyStorePort } from "../ports/idempotency-store.port";
import type { Command } from "../domain/command";
import { mapDtoToCommand, type CommandDto } from "./dto/command.dto";
import { CommandDispatcher } from "./command-dispatcher";
import { isCommandType } from "../domain/command";
import { validateCommand } from "./validators/command.validator";
import type { CommandAckEvent, CommandResultEvent } from "../domain/events";

type StoredResult = { ack: CommandAckEvent; result: CommandResultEvent };
export class MqttCommandGateway {
  constructor(
    private readonly deps: {
      mqtt: MqttClientPort;
      logger: LoggerPort;
      store: IdempotencyStorePort<StoredResult>;
      dispatcher: CommandDispatcher;
      deviceId: string;
      topics: { commands: string; events: string };
    },
  ) {}

  start(): void {
    this.deps.mqtt.onMessage((msg) => void this.handleMessage(msg.topic, msg.payload));
  }

  private async handleMessage(topic: string, payload: string): Promise<void> {
    if (topic !== this.deps.topics.commands) return;

    const now = Date.now();

    let dto: CommandDto;
    try {
      dto = JSON.parse(payload);
    } catch {
      this.deps.logger.warn("Invalid JSON command payload");
      return;
    }

    const mapped = mapDtoToCommand(dto);
    if ("code" in mapped) {
      await this.publishAckAndError(dto, mapped.message);
      return;
    }

    const command = mapped as Command;

    const validated = validateCommand(command);
    if ("code" in validated) {
      await this.publishAckAndError(dto, validated.message);
      return;
    }
    const safeCommand = validated as Command;

    const existing = await this.deps.store.get(safeCommand.correlationId);
    if (existing) {
      this.deps.logger.info("Duplicate command", {
        correlationId: safeCommand.correlationId,
      });
      const dupAck: CommandAckEvent = {
        type: "command_ack",
        timestamp: now,
        payload: {
          correlationId: safeCommand.correlationId,
          command: safeCommand.type,
          status: "duplicate",
          reason: "Duplicate correlationId",
        },
      };

      await this.publishWithRetry(this.deps.topics.events, JSON.stringify(dupAck), { qos: 1 });

      await this.publishWithRetry(this.deps.topics.events, JSON.stringify(existing.value.result), {
        qos: 1,
      });

      return;
    }

    const ack: CommandAckEvent = {
      type: "command_ack",
      timestamp: now,
      payload: {
        correlationId: safeCommand.correlationId,
        command: safeCommand.type,
        status: "received",
      },
    };

    await this.publishWithRetry(this.deps.topics.events, JSON.stringify(ack), {
      qos: 1,
    });

    const exec = await this.deps.dispatcher.dispatch(safeCommand);

    const result: CommandResultEvent = exec.ok
      ? this.buildSuccessResult(safeCommand, exec.result)
      : this.buildErrorResult(safeCommand, exec.error);

    await this.publishWithRetry(this.deps.topics.events, JSON.stringify(result), { qos: 1 });

    await this.deps.store.set({
      key: safeCommand.correlationId,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      value: { ack, result },
    });
  }

  private async publishAckAndError(dto: CommandDto, reason: string): Promise<void> {
    const now = Date.now();
    const correlationId = typeof dto.correlationId === "string" ? dto.correlationId : "invalid";

    const ack: CommandAckEvent = {
      type: "command_ack",
      timestamp: now,
      payload: {
        correlationId,
        status: "rejected",
        reason,
        ...(isCommandType(dto.command) ? { command: dto.command } : {}),
      },
    };

    await this.publishWithRetry(this.deps.topics.events, JSON.stringify(ack), {
      qos: 1,
    });
  }

  private buildSuccessResult(command: Command, execResult: unknown): CommandResultEvent {
    if (command.type === "screenshot") {
      const shot = execResult as
        | { format?: "image/png" | "image/jpeg"; base64?: string }
        | undefined;

      if (
        !shot ||
        (shot.format !== "image/png" && shot.format !== "image/jpeg") ||
        typeof shot.base64 !== "string" ||
        shot.base64.length === 0
      ) {
        return this.buildErrorResult(command, {
          code: "INTERNAL_ERROR",
          message: "Screenshot output is invalid",
          details: { code: "SCREENSHOT_INVALID_OUTPUT" },
        });
      }

      return {
        type: "command_result",
        timestamp: Date.now(),
        payload: {
          correlationId: command.correlationId,
          command: command.type,
          status: "success",
          format: shot.format,
          base64: shot.base64,
        },
      };
    }

    return {
      type: "command_result",
      timestamp: Date.now(),
      payload: {
        correlationId: command.correlationId,
        command: command.type,
        status: "success",
        result: execResult,
      },
    };
  }

  private buildErrorResult(
    command: Command,
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): CommandResultEvent {
    const code = (error.details?.code as string | undefined) ?? error.code ?? "INTERNAL_ERROR";

    return {
      type: "command_result",
      timestamp: Date.now(),
      payload: {
        correlationId: command.correlationId,
        command: command.type,
        status: "error",
        error: { code, message: error.message },
      },
    };
  }

  private async publishWithRetry(
    topic: string,
    payload: string,
    options: { qos: 0 | 1 | 2; retain?: boolean } = { qos: 1 },
    cfg: { attempts?: number; baseDelayMs?: number } = {},
  ): Promise<void> {
    const attempts = cfg.attempts ?? 3;
    const baseDelayMs = cfg.baseDelayMs ?? 200;

    let lastErr: unknown = null;

    for (let i = 1; i <= attempts; i++) {
      try {
        await this.deps.mqtt.publish(topic, payload, options);
        return;
      } catch (e) {
        lastErr = e;

        this.deps.logger.warn("MQTT publish failed, will retry", {
          attempt: i,
          attempts,
          topic,
          error: e instanceof Error ? e.message : String(e),
        });

        if (i === attempts) break;

        const delay = baseDelayMs * Math.pow(2, i - 1);
        await new Promise<void>((r) => setTimeout(r, delay));
      }
    }

    this.deps.logger.error("MQTT publish failed after retries", {
      topic,
      attempts,
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    });
  }
}
