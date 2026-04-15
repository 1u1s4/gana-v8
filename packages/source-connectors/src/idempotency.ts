import { createHash } from "node:crypto";

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

export interface IdempotencyKeyParts {
  readonly providerCode: string;
  readonly endpointFamily: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly params?: Record<string, unknown>;
  readonly pageCursor?: string;
}

export const buildChecksum = (value: unknown): string =>
  createHash("sha256").update(stableSerialize(value)).digest("hex");

export const buildIdempotencyKey = (parts: IdempotencyKeyParts): string =>
  buildChecksum({
    providerCode: parts.providerCode,
    endpointFamily: parts.endpointFamily,
    pageCursor: parts.pageCursor ?? null,
    params: parts.params ?? {},
    windowEnd: parts.windowEnd,
    windowStart: parts.windowStart,
  });
