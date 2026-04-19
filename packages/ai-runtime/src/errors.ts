export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export class AiExecutionError extends Error {
  readonly provider: string;
  readonly cause?: unknown;

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AiExecutionError";
    this.provider = provider;
    this.cause = options?.cause;
  }
}
