import mqtt from "mqtt";
import type { MqttClient } from "mqtt";
import type {
  MqttClientPort,
  MqttConnectOptions,
  MqttMessage,
  ConnectionStatus,
  PublishOptions,
  SubscribeOptions,
} from "../../core/ports/mqtt-client.port";

export class MqttJsClientAdapter implements MqttClientPort {
  private client: MqttClient | null = null;
  private messageHandler: ((msg: MqttMessage) => void) | null = null;
  private statusHandler: ((s: ConnectionStatus) => void) | null = null;

  async connect(options: MqttConnectOptions): Promise<void> {
    const url = import.meta.env.VITE_MQTT_URL as string | undefined;
    if (!url) throw new Error("VITE_MQTT_URL is not set");

    const reconnectEnabled = options.reconnect?.enabled ?? true;
    const reconnectPeriod = reconnectEnabled ? (options.reconnect?.minDelayMs ?? 1000) : 0;

    this.client = mqtt.connect(url, {
      clientId: options.clientId,
      reconnectPeriod,
      will: options.lastWill
        ? {
            topic: options.lastWill.topic,
            payload: options.lastWill.payload,
            qos: options.lastWill.qos ?? 1,
            retain: options.lastWill.retain ?? false,
          }
        : undefined,
    });

    this.client.on("connect", () => this.statusHandler?.("connected"));
    this.client.on("reconnect", () => this.statusHandler?.("reconnecting"));
    this.client.on("close", () => this.statusHandler?.("disconnected"));

    this.client.on("message", (topic, payload) => {
      this.messageHandler?.({
        topic,
        payload: payload.toString("utf-8"),
        receivedAt: Date.now(),
      });
    });

    await new Promise<void>((resolve, reject) => {
      const c = this.client!;
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        c.off("connect", onConnect);
        c.off("error", onError);
      };
      c.on("connect", onConnect);
      c.on("error", onError);
    });
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    const c = this.client;
    this.client = null;
    await new Promise<void>((resolve) => c.end(false, {}, () => resolve()));
  }

  async subscribe(topic: string, options?: SubscribeOptions): Promise<void> {
    if (!this.client) throw new Error("MQTT client not connected");
    await new Promise<void>((resolve, reject) => {
      this.client!.subscribe(topic, { qos: options?.qos ?? 1 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async publish(topic: string, payload: string, options?: PublishOptions): Promise<void> {
    if (!this.client) throw new Error("MQTT client not connected");
    await new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, payload, { qos: options?.qos ?? 1, retain: options?.retain ?? false }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  onMessage(handler: (msg: MqttMessage) => void): void {
    this.messageHandler = handler;
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): void {
    this.statusHandler = handler;
  }
}