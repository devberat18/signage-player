import type { CorrelationId, CommandType } from "./command";

export type EventType = "command_ack" | "command_result" | "heartbeat" | "log";

export interface BaseEvent<T extends EventType, TPayload> {
  type: T;
  timestamp: number;
  payload: TPayload;
}

export type AckStatus = "received" | "duplicate" | "rejected" | "in_progress";

export interface CommandAckPayload {
  correlationId: CorrelationId;
  command: CommandType;
  status: AckStatus;
  reason?: string;
}

export type CommandAckEvent = BaseEvent<"command_ack", CommandAckPayload>;

export type CommandResultStatus = "success" | "error";

export interface CommandResultPayload<TResult = unknown> {
  correlationId: CorrelationId;
  command: CommandType;
  status: CommandResultStatus;
  result?: TResult;
  errorMessage?: string;
}

export type CommandResultEvent<TResult = unknown> = BaseEvent<
  "command_result",
  CommandResultPayload<TResult>
>;

export type HeartbeatStatus = "online" | "offline";

export interface HeartbeatPayload {
  status: HeartbeatStatus;
  deviceId: string;
  version?: string;
  uptimeSec?: number;
}

export type HeartbeatEvent = BaseEvent<"heartbeat", HeartbeatPayload>;

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogPayload {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export type LogEvent = BaseEvent<"log", LogPayload>;

export type PlayerEvent =
  | CommandAckEvent
  | CommandResultEvent
  | HeartbeatEvent
  | LogEvent;