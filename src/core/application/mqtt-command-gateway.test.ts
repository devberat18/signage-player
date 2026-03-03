import { describe, it, expect, vi } from "vitest";
import { MqttCommandGateway } from "./mqtt-command-gateway";
import { CommandDispatcher } from "./command-dispatcher";
import type { MqttClientPort, MqttMessage } from "../ports/mqtt-client.port";
import type { LoggerPort } from "../ports/logger.port";
import type { IdempotencyStorePort, IdempotencyRecord } from "../ports/idempotency-store.port";
import type { CommandAckEvent, CommandResultEvent } from "../domain/events";


const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));


const DEVICE_ID = "device-1";
const COMMANDS_TOPIC = `players/${DEVICE_ID}/commands`;
const EVENTS_TOPIC = `players/${DEVICE_ID}/events`;


function makeMqtt() {
  let messageHandler: ((msg: MqttMessage) => void) | undefined;

  const mqtt: MqttClientPort = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    onMessage(handler) {
      messageHandler = handler;
    },
    onStatusChange: vi.fn(),
  };

  const send = (topic: string, payload: string) =>
    messageHandler?.({ topic, payload, receivedAt: Date.now() });

  return { mqtt, send };
}

function makeLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

type StoredResult = { ack: CommandAckEvent; result: CommandResultEvent };

function makeEmptyStore(): IdempotencyStorePort<StoredResult> {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

type GatewayOverrides = {
  dispatcher?: CommandDispatcher;
  store?: IdempotencyStorePort<StoredResult>;
};

function makeGateway(overrides: GatewayOverrides = {}) {
  const { mqtt, send } = makeMqtt();
  const logger = makeLogger();
  const store = overrides.store ?? makeEmptyStore();
  const dispatcher = overrides.dispatcher ?? new CommandDispatcher([]);

  const gateway = new MqttCommandGateway({
    mqtt,
    logger,
    store,
    dispatcher,
    deviceId: DEVICE_ID,
    topics: { commands: COMMANDS_TOPIC, events: EVENTS_TOPIC },
  });

  gateway.start();

  return { gateway, mqtt, logger, store, dispatcher, send };
}

function publishedEvents(mqtt: MqttClientPort) {
  return (mqtt.publish as ReturnType<typeof vi.fn>).mock.calls
    .map((args) => JSON.parse(args[1] as string));
}

const validPayload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    command: "reload_playlist",
    correlationId: "corr-abc123",
    timestamp: 1700000000000,
    ...overrides,
  });


describe("MqttCommandGateway", () => {
  describe("topic filtering", () => {
    it("ignores messages on wrong topic", async () => {
      const { mqtt, send } = makeGateway();

      send("other/topic", validPayload());
      await flushPromises();

      expect(mqtt.publish).not.toHaveBeenCalled();
    });
  });

  describe("invalid JSON", () => {
    it("logs a warning and does not publish for malformed JSON", async () => {
      const { logger, mqtt, send } = makeGateway();

      send(COMMANDS_TOPIC, "{ not valid json }}");
      await flushPromises();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Invalid JSON"),
      );
      expect(mqtt.publish).not.toHaveBeenCalled();
    });
  });

  describe("validation errors → rejected ack", () => {
    it("publishes rejected ack for unsupported command type", async () => {
      const { mqtt, send } = makeGateway();

      send(COMMANDS_TOPIC, validPayload({ command: "unsupported_command" }));
      await flushPromises();

      const events = publishedEvents(mqtt);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "command_ack",
        payload: { status: "rejected" },
      });
    });

    it("publishes rejected ack when correlationId is too short (< 6 chars)", async () => {
      const { mqtt, send } = makeGateway();

      send(COMMANDS_TOPIC, validPayload({ correlationId: "abc" }));
      await flushPromises();

      const events = publishedEvents(mqtt);
      expect(events[0]).toMatchObject({
        type: "command_ack",
        payload: { status: "rejected" },
      });
    });

    it("publishes rejected ack when timestamp is not a number", async () => {
      const { mqtt, send } = makeGateway();

      send(
        COMMANDS_TOPIC,
        JSON.stringify({
          command: "reload_playlist",
          correlationId: "corr-abc123",
          timestamp: "not-a-number",
        }),
      );
      await flushPromises();

      const events = publishedEvents(mqtt);
      expect(events[0]).toMatchObject({
        type: "command_ack",
        payload: { status: "rejected" },
      });
    });

    it("publishes rejected ack when reload_playlist receives an unexpected payload", async () => {
      const { mqtt, send } = makeGateway();

      send(
        COMMANDS_TOPIC,
        validPayload({ payload: { unexpected: true } }),
      );
      await flushPromises();

      const events = publishedEvents(mqtt);
      expect(events[0]).toMatchObject({
        type: "command_ack",
        payload: { status: "rejected" },
      });
    });

    it("publishes rejected ack when set_volume is out of range", async () => {
      const { mqtt, send } = makeGateway();

      send(
        COMMANDS_TOPIC,
        validPayload({ command: "set_volume", payload: { volume: 150 } }),
      );
      await flushPromises();

      const events = publishedEvents(mqtt);
      expect(events[0]).toMatchObject({
        type: "command_ack",
        payload: { status: "rejected" },
      });
    });
  });

  describe("duplicate correlationId", () => {
    it("publishes duplicate ack and the cached result without dispatching", async () => {
      const dispatcher = new CommandDispatcher([]);
      const dispatchSpy = vi.spyOn(dispatcher, "dispatch");

      const cachedRecord: IdempotencyRecord<StoredResult> = {
        key: "corr-abc123",
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        value: {
          ack: {
            type: "command_ack",
            timestamp: 100,
            payload: {
              correlationId: "corr-abc123",
              command: "reload_playlist",
              status: "received",
            },
          },
          result: {
            type: "command_result",
            timestamp: 101,
            payload: {
              correlationId: "corr-abc123",
              command: "reload_playlist",
              status: "success",
              result: { reloaded: true },
            },
          },
        },
      };

      const store = makeEmptyStore();
      (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedRecord);

      const { mqtt, send } = makeGateway({ dispatcher, store });

      send(COMMANDS_TOPIC, validPayload());
      await flushPromises();

      expect(dispatchSpy).not.toHaveBeenCalled();

      const events = publishedEvents(mqtt);
      expect(
        events.find((e) => e.type === "command_ack" && e.payload.status === "duplicate"),
      ).toBeDefined();
      expect(
        events.find((e) => e.type === "command_result"),
      ).toBeDefined();
    });

    it("logs the duplicate with correlationId", async () => {
      const store = makeEmptyStore();
      const cachedRecord: IdempotencyRecord<StoredResult> = {
        key: "corr-abc123",
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        value: {
          ack: {
            type: "command_ack",
            timestamp: 100,
            payload: { correlationId: "corr-abc123", command: "reload_playlist", status: "received" },
          },
          result: {
            type: "command_result",
            timestamp: 101,
            payload: { correlationId: "corr-abc123", command: "reload_playlist", status: "success" },
          },
        },
      };
      (store.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedRecord);

      const { logger, send } = makeGateway({ store });

      send(COMMANDS_TOPIC, validPayload());
      await flushPromises();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Duplicate"),
        expect.objectContaining({ correlationId: "corr-abc123" }),
      );
    });
  });

  describe("successful command flow", () => {
    it("publishes received ack, dispatches handler, stores result, and publishes command_result", async () => {
      const handler = {
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({ ok: true, result: { reloaded: true } }),
      };
      const dispatcher = new CommandDispatcher([handler]);
      const store = makeEmptyStore();

      const { mqtt, send } = makeGateway({ dispatcher, store });

      send(COMMANDS_TOPIC, validPayload());
      await flushPromises();

      const events = publishedEvents(mqtt);

      expect(
        events.find((e) => e.type === "command_ack" && e.payload.status === "received"),
      ).toBeDefined();

      expect(handler.handle).toHaveBeenCalledOnce();

      expect(
        events.find((e) => e.type === "command_result" && e.payload.status === "success"),
      ).toBeDefined();

      expect(store.set).toHaveBeenCalledOnce();
    });

    it("published command_result includes correlationId and command type", async () => {
      const handler = {
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({ ok: true, result: {} }),
      };

      const { mqtt, send } = makeGateway({ dispatcher: new CommandDispatcher([handler]) });

      send(COMMANDS_TOPIC, validPayload());
      await flushPromises();

      const result = publishedEvents(mqtt).find((e) => e.type === "command_result");

      expect(result?.payload).toMatchObject({
        correlationId: "corr-abc123",
        command: "reload_playlist",
        status: "success",
      });
    });

    it("publishes command_result with status error when dispatch fails", async () => {
      const handler = {
        canHandle: vi.fn().mockReturnValue(true),
        handle: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: "PLATFORM_ERROR", message: "something went wrong" },
        }),
      };

      const { mqtt, send } = makeGateway({ dispatcher: new CommandDispatcher([handler]) });

      send(COMMANDS_TOPIC, validPayload());
      await flushPromises();

      const result = publishedEvents(mqtt).find((e) => e.type === "command_result");

      expect(result?.payload).toMatchObject({
        status: "error",
      });
    });
  });
});
