export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "UNSUPPORTED_COMMAND"
  | "IDEMPOTENCY_STORE_ERROR"
  | "PLATFORM_ERROR"
  | "INTERNAL_ERROR";

export interface DomainError {
  code: DomainErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function domainError(
  code: DomainErrorCode,
  message: string,
  details?: Record<string, unknown>
): DomainError {
  return { code, message, details };
}

export function isDomainError(value: unknown): value is DomainError {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<DomainError>;
  return typeof v.code === "string" && typeof v.message === "string";
}