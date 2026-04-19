export class AiConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = "AiConfigurationError";
    }
}
export class AiExecutionError extends Error {
    provider;
    cause;
    constructor(provider, message, options) {
        super(message);
        this.name = "AiExecutionError";
        this.provider = provider;
        this.cause = options?.cause;
    }
}
//# sourceMappingURL=errors.js.map