export declare class AiConfigurationError extends Error {
    constructor(message: string);
}
export declare class AiExecutionError extends Error {
    readonly provider: string;
    readonly cause?: unknown;
    constructor(provider: string, message: string, options?: {
        cause?: unknown;
    });
}
//# sourceMappingURL=errors.d.ts.map