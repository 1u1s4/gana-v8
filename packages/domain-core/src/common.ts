export type EntityId = string;
export type ISODateString = string;

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

export const assertNever = (value: never, message = 'Unexpected value'): never => {
  throw new DomainError(`${message}: ${String(value)}`, 'UNEXPECTED_VALUE');
};
