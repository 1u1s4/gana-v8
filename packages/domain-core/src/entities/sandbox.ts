import type { AuditableEntity, Environment, ISODateString } from "../common.js";
import { DomainError, nowIso } from "../common.js";

export interface SandboxNamespace extends AuditableEntity {
  readonly environment: Environment;
  readonly sandboxId?: string;
  readonly scope: string;
  readonly storagePrefix: string;
  readonly queuePrefix: string;
  readonly metadata: Record<string, string>;
}

export const createSandboxNamespace = (
  input: Omit<SandboxNamespace, "createdAt" | "updatedAt"> &
    Partial<Pick<SandboxNamespace, "createdAt" | "updatedAt">>,
): SandboxNamespace => {
  if (input.environment === "sandbox" && !input.sandboxId) {
    throw new DomainError(
      "Sandbox namespaces require sandboxId",
      "SANDBOX_ID_REQUIRED",
    );
  }

  const timestamp = input.createdAt ?? nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
};

export const namespaceKey = (namespace: SandboxNamespace): string =>
  namespace.environment === "sandbox"
    ? `${namespace.environment}:${namespace.sandboxId}:${namespace.scope}`
    : `${namespace.environment}:${namespace.scope}`;

export const assertSandboxIsolation = (
  namespace: SandboxNamespace,
  forbiddenPrefix: string,
): void => {
  if (
    namespace.environment === "sandbox" &&
    namespace.storagePrefix.startsWith(forbiddenPrefix)
  ) {
    throw new DomainError(
      "Sandbox namespace points to a forbidden storage prefix",
      "SANDBOX_NAMESPACE_LEAK",
    );
  }
};
