import { getAllowedCodexModelOptions } from "@gana-v8/model-registry";
import { AiConfigurationError, AiExecutionError } from "./errors.js";
let mockResponseSequence = 0;
function nextMockResponseId() {
    mockResponseSequence += 1;
    return `mock_codex_${mockResponseSequence}`;
}
function buildJsonHeaders(apiKey) {
    return {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
    };
}
async function readJsonBody(response) {
    const bodyText = await response.text();
    if (!bodyText.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(bodyText);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch (error) {
        throw new AiExecutionError("codex", `Failed to parse codex JSON response: ${bodyText.slice(0, 200)}`, { cause: error });
    }
}
function extractOutputText(body) {
    if (typeof body.output_text === "string") {
        return body.output_text;
    }
    const output = Array.isArray(body.output) ? body.output : [];
    const chunks = [];
    for (const entry of output) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const content = Array.isArray(entry.content)
            ? (entry.content ?? [])
            : [];
        for (const part of content) {
            if (part &&
                typeof part === "object" &&
                typeof part.text === "string") {
                chunks.push(part.text);
            }
        }
    }
    return chunks.join("");
}
function normalizeUsage(body) {
    const usage = body.usage;
    if (!usage || typeof usage !== "object") {
        return undefined;
    }
    const record = usage;
    return {
        ...record,
        ...(typeof record.input_tokens === "number"
            ? { inputTokens: record.input_tokens }
            : {}),
        ...(typeof record.output_tokens === "number"
            ? { outputTokens: record.output_tokens }
            : {}),
        ...(typeof record.total_tokens === "number"
            ? { totalTokens: record.total_tokens }
            : {}),
    };
}
function toCatalogItem(modelId, source) {
    return {
        id: modelId,
        label: source?.label ?? modelId,
        provider: "codex",
        supportsReasoning: true,
        supportsWebSearch: source?.supportsWebSearch ?? true,
        ...(source?.defaultReasoning
            ? { defaultReasoningLevel: source.defaultReasoning }
            : {}),
        ...(source?.supportedReasoningLevels
            ? { supportedReasoningLevels: [...source.supportedReasoningLevels] }
            : {}),
        ...(source?.availabilitySource
            ? { availabilitySource: source.availabilitySource }
            : { availabilitySource: "upstream" }),
    };
}
function normalizeModelList(models) {
    const fallback = new Map(getAllowedCodexModelOptions().map((model) => [model.id, model]));
    return models.map((modelId) => toCatalogItem(modelId, fallback.get(modelId)));
}
export function createMockCodexClient(options = {}) {
    const model = options.model ?? "gpt-5.4";
    const outputText = options.outputText ?? "Mock codex response";
    const usage = options.usage ?? {
        inputTokens: 12,
        outputTokens: 18,
        totalTokens: 30,
    };
    const eventSequence = options.eventSequence ??
        [
            { type: "response.output_text.delta", delta: outputText },
            {
                type: "response.completed",
                response: { id: "mock_response", status: "completed", model },
            },
        ];
    return {
        async responses(args) {
            const resolvedModel = args.model ?? model;
            const responseId = nextMockResponseId();
            return {
                model: resolvedModel,
                outputText,
                body: {
                    id: responseId,
                    status: "completed",
                    model: resolvedModel,
                    output_text: outputText,
                    usage,
                },
                events: [...eventSequence],
                responseState: {
                    id: responseId,
                    status: "completed",
                    model: resolvedModel,
                },
            };
        },
        async streamResponses(args) {
            const resolvedModel = args.model ?? model;
            return {
                model: resolvedModel,
                events: (async function* () {
                    for (const event of eventSequence) {
                        yield event;
                    }
                })(),
            };
        },
        async listModels() {
            if (options.listModels) {
                return {
                    models: options.listModels.map((entry) => ({ ...entry })),
                };
            }
            return {
                models: getAllowedCodexModelOptions().map((modelOption) => toCatalogItem(modelOption.id, modelOption)),
            };
        },
    };
}
function buildResponsesBody(args, stream) {
    return {
        ...(args.model ? { model: args.model } : {}),
        ...(args.instructions ? { instructions: args.instructions } : {}),
        ...(args.input ? { input: args.input } : {}),
        ...(args.reasoning ? { reasoning: { effort: args.reasoning } } : {}),
        ...(args.tools ? { tools: args.tools } : {}),
        ...(args.toolChoice ? { tool_choice: args.toolChoice } : {}),
        stream,
    };
}
export function createCodexHttpClient(options = {}) {
    const baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const apiKey = options.apiKey ?? process.env.CODEX_API_KEY ?? process.env.OPENAI_API_KEY;
    const fetchImpl = options.fetchImpl ?? fetch;
    if (!apiKey) {
        throw new AiConfigurationError("Missing CODEX_API_KEY or OPENAI_API_KEY for codex HTTP client.");
    }
    return {
        async responses(args) {
            const response = await fetchImpl(`${baseUrl}/responses`, {
                method: "POST",
                headers: buildJsonHeaders(apiKey),
                body: JSON.stringify(buildResponsesBody(args, false)),
            });
            const body = await readJsonBody(response);
            if (!response.ok) {
                throw new AiExecutionError("codex", `Codex responses API returned ${response.status}.`, { cause: body });
            }
            return {
                ...(typeof body.model === "string"
                    ? { model: body.model }
                    : args.model
                        ? { model: args.model }
                        : {}),
                outputText: extractOutputText(body),
                body,
                events: [],
                responseState: {
                    ...(typeof body.id === "string" ? { id: body.id } : {}),
                    ...(typeof body.status === "string" ? { status: body.status } : {}),
                    ...(typeof body.model === "string"
                        ? { model: body.model }
                        : args.model
                            ? { model: args.model }
                            : {}),
                },
            };
        },
        async streamResponses(args) {
            const response = await fetchImpl(`${baseUrl}/responses`, {
                method: "POST",
                headers: buildJsonHeaders(apiKey),
                body: JSON.stringify(buildResponsesBody(args, true)),
            });
            if (!response.ok) {
                throw new AiExecutionError("codex", `Codex streaming API returned ${response.status}.`);
            }
            if (!response.body) {
                throw new AiExecutionError("codex", "Codex streaming response body is empty.");
            }
            const decoder = new TextDecoder();
            const stream = response.body;
            return {
                ...(args.model ? { model: args.model } : {}),
                events: (async function* () {
                    let buffer = "";
                    for await (const chunk of stream) {
                        buffer += decoder.decode(chunk, { stream: true });
                        const parts = buffer.split("\n\n");
                        buffer = parts.pop() ?? "";
                        for (const part of parts) {
                            const lines = part
                                .split("\n")
                                .map((line) => line.trim())
                                .filter(Boolean);
                            const dataLine = lines.find((line) => line.startsWith("data:"));
                            if (!dataLine) {
                                continue;
                            }
                            const payload = dataLine.slice(5).trim();
                            if (payload === "[DONE]") {
                                continue;
                            }
                            yield JSON.parse(payload);
                        }
                    }
                })(),
            };
        },
        async listModels() {
            const response = await fetchImpl(`${baseUrl}/models`, {
                method: "GET",
                headers: buildJsonHeaders(apiKey),
            });
            const body = await readJsonBody(response);
            if (!response.ok) {
                throw new AiExecutionError("codex", `Codex models API returned ${response.status}.`);
            }
            const data = Array.isArray(body.data) ? body.data : [];
            const models = data
                .map((entry) => entry && typeof entry === "object" && typeof entry.id === "string"
                ? entry.id
                : null)
                .filter((entry) => Boolean(entry));
            return {
                models: normalizeModelList(models),
            };
        },
    };
}
export function getAiClient(provider, options) {
    if (provider !== "codex") {
        throw new AiConfigurationError(`Unsupported AI client provider: ${provider}`);
    }
    return createCodexHttpClient(options);
}
export function normalizeProviderUsage(body) {
    return normalizeUsage(body);
}
//# sourceMappingURL=clients.js.map