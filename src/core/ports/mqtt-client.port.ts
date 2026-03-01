export type MqttQoS = 0 | 1 | 2;

export interface MqttMessage {
  topic: string;
  payload: string;
  receivedAt: number;
}

export interface MqttConnectOptions {
  clientId: string;

  lastWill?: {
    topic: string;
    payload: string;
    qos?: MqttQoS;
    retain?: boolean;
  };

  reconnect?: {
    enabled: boolean;
    minDelayMs: number;
    maxDelayMs: number;
  };
}

export interface SubscribeOptions {
  qos?: MqttQoS;
}

export interface PublishOptions {
  qos?: MqttQoS;
  retain?: boolean;
}

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export interface MqttClientPort {
  connect(options: MqttConnectOptions): Promise<void>;
  disconnect(): Promise<void>;

  subscribe(topic: string, options?: SubscribeOptions): Promise<void>;
  publish(topic: string, payload: string, options?: PublishOptions): Promise<void>;

  onMessage(handler: (msg: MqttMessage) => void): void;
  onStatusChange(handler: (status: ConnectionStatus) => void): void;
}