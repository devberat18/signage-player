export interface IdempotencyRecord<T = unknown> {
  key: string;
  createdAt: number;
  expiresAt: number;
  value: T;
}

export interface IdempotencyStorePort<T = unknown> {
  get(key: string): Promise<IdempotencyRecord<T> | null>;
  set(record: IdempotencyRecord<T>): Promise<void>;
  delete(key: string): Promise<void>;
}