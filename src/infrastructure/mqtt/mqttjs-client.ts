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

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private reconnectDelayMs = 1000;
  private minDelayMs = 1000;
  private maxDelayMs = 30_000;

  async connect(options: MqttConnectOptions): Promise<void> {
    const url = import.meta.env.VITE_MQTT_URL as string | undefined;
    if (!url) throw new Error("VITE_MQTT_URL is not set");

    const reconnectEnabled = options.reconnect?.enabled ?? true;
    this.minDelayMs = options.reconnect?.minDelayMs ?? 1000;
    this.maxDelayMs = options.reconnect?.maxDelayMs ?? 30_000;
    this.reconnectDelayMs = this.minDelayMs;
    
    this.client = mqtt.connect(url, {
      clientId: options.clientId,
      reconnectPeriod: 0,
      will: options.lastWill
        ? {
            topic: options.lastWill.topic,
            payload: options.lastWill.payload,
            qos: options.lastWill.qos ?? 1,
            retain: options.lastWill.retain ?? false,
          }
        : undefined,
    });

    this.client.on("connect", () => {
      this.reconnectDelayMs = this.minDelayMs;
      this.statusHandler?.("connected");
    });

    this.client.on("close", () => {
      this.statusHandler?.("disconnected");
      this.scheduleReconnect();
    });

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
        this.shouldReconnect = reconnectEnabled;
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

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || !this.client || this.reconnectTimer !== null) return;

    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxDelayMs);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect && this.client) {
        this.statusHandler?.("reconnecting");
        this.client.reconnect();
      }
    }, delay);
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
      this.client!.publish(
        topic,
        payload,
        { qos: options?.qos ?? 1, retain: options?.retain ?? false },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  }

  onMessage(handler: (msg: MqttMessage) => void): void {
    this.messageHandler = handler;
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): void {
    this.statusHandler = handler;
  }
}
