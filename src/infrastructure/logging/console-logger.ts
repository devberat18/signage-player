import type { LoggerPort } from "../../core/ports/logger.port";

export class ConsoleLogger implements LoggerPort {
  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(message, context ?? "");
  }
  info(message: string, context?: Record<string, unknown>): void {
    console.info(message, context ?? "");
  }
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(message, context ?? "");
  }
  error(message: string, context?: Record<string, unknown>): void {
    console.error(message, context ?? "");
  }
}