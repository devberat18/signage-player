import type { MqttClientPort } from "../ports/mqtt-client.port";
import type { LoggerPort } from "../ports/logger.port";
import type { IdempotencyStorePort } from "../ports/idempotency-store.port";
import type { Command } from "../domain/command";
import type { PlayerEvent } from "../domain/events";
import { mapDtoToCommand, type CommandDto } from "./dto/command.dto";
import { CommandDispatcher } from "./command-dispatcher";

type StoredResult = { ack: PlayerEvent; result: PlayerEvent };

export class MqttCommandGateway {
  constructor(
    private readonly deps: {
      mqtt: MqttClientPort;
      logger: LoggerPort;
      store: IdempotencyStorePort<StoredResult>;
      dispatcher: CommandDispatcher;
      deviceId: string;
      topics: { commands: string; events: string };
    }
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

    const existing = await this.deps.store.get(command.correlationId);
    if (existing) {
      this.deps.logger.info("Duplicate command", { correlationId: command.correlationId });
      await this.deps.mqtt.publish(this.deps.topics.events, JSON.stringify(existing.value.ack), { qos: 1 });
      await this.deps.mqtt.publish(this.deps.topics.events, JSON.stringify(existing.value.result), { qos: 1 });
      return;
    }

    const ack: PlayerEvent = {
      type: "command_ack",
      timestamp: now,
      payload: {
        correlationId: command.correlationId,
        command: command.type,
        status: "received",
      },
    };

    await this.deps.mqtt.publish(this.deps.topics.events, JSON.stringify(ack), { qos: 1 });

    const exec = await this.deps.dispatcher.dispatch(command);

    const result: PlayerEvent = exec.ok
      ? {
          type: "command_result",
          timestamp: Date.now(),
          payload: {
            correlationId: command.correlationId,
            command: command.type,
            status: "success",
            result: exec.result,
          },
        }
      : {
          type: "command_result",
          timestamp: Date.now(),
          payload: {
            correlationId: command.correlationId,
            command: command.type,
            status: "error",
            errorMessage: exec.error.message,
          },
        };

    await this.deps.mqtt.publish(this.deps.topics.events, JSON.stringify(result), { qos: 1 });

    await this.deps.store.set({
      key: command.correlationId,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      value: { ack, result },
    });
  }

  private async publishAckAndError(dto: CommandDto, reason: string): Promise<void> {
    const now = Date.now();
    const correlationId = typeof dto.correlationId === "string" ? dto.correlationId : "invalid";

    const ack: PlayerEvent = {
      type: "command_ack",
      timestamp: now,
      payload: {
        correlationId,
        command: "reload_playlist",
        status: "rejected",
        reason,
      },
    };

    await this.deps.mqtt.publish(this.deps.topics.events, JSON.stringify(ack), { qos: 1 });
  }
}