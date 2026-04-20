export type EntityId = string;
export type ISODateString = string;

import { createHash } from "node:crypto";

export type Environment = 'prod' | 'staging' | 'sandbox';

export interface AuditableEntity {
  readonly id: EntityId;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface Repository<T extends AuditableEntity> {
  save(entity: T): Promise<T>;
  getById(id: EntityId): Promise<T | null>;
  list(): Promise<T[]>;
  delete(id: EntityId): Promise<void>;
}

export class DomainError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export const nowIso = (): ISODateString => new Date().toISOString();

const createOpaqueEntityId = (prefix: string, seed: string): EntityId => {
  const digest = createHash("sha256").update(seed).digest("hex");
  return `${prefix}_${digest.slice(0, 16)}`;
};

export const createOpaqueTaskId = (seed: string): EntityId => createOpaqueEntityId("tsk", seed);

export const createOpaqueTaskRunId = (taskId: string, attemptNumber: number): EntityId =>
  createOpaqueEntityId("trn", `${taskId}:attempt:${attemptNumber}`);

export const assertNever = (value: never, message = 'Unexpected value'): never => {
  throw new DomainError(`${message}: ${String(value)}`, 'UNEXPECTED_VALUE');
};
