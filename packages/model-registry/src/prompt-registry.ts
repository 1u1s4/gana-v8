import {
  DEFAULT_ATOMIC_TEMPLATE_KEY,
  DEFAULT_PARLAY_TEMPLATE_KEY,
  getAtomicTemplateMetadata,
  getParlayTemplateMetadata,
  type AtomicTemplateKey,
  type ParlayTemplateKey,
} from "./template-catalog.js";

export type PromptRegistryKey =
  | "research.fixture-analysis"
  | "research.bundle-summary"
  | "scoring.ticket-synthesis"
  | "scoring.fixture-synthesis";

export interface PromptRenderInput {
  readonly context: string;
  readonly outputContract?: string;
}

export interface PromptDefinition {
  readonly key: PromptRegistryKey;
  readonly version: string;
  readonly scope: "research" | "scoring";
  readonly label: string;
  readonly templateKey?: AtomicTemplateKey | ParlayTemplateKey;
  render(input: PromptRenderInput): {
    systemPrompt: string;
    userPrompt: string;
  };
}

function buildResearchFixtureAnalysisPrompt(
  templateKey: AtomicTemplateKey,
): PromptDefinition {
  const template = getAtomicTemplateMetadata(templateKey);

  return {
    key: "research.fixture-analysis",
    version: template.version,
    scope: "research",
    label: template.label,
    templateKey,
    render(input) {
      return {
        systemPrompt: [
          "Sos un analista deportivo senior.",
          `Template: ${template.key} (${template.version}).`,
          `Foco: ${template.focus}.`,
          "Responde en español con trazabilidad clara y evita inventar datos.",
        ].join(" "),
        userPrompt: [
          "Analizá el fixture usando el contexto provisto; si hay herramienta web disponible o requerida, usala sólo para verificar fuentes actuales citables.",
          input.outputContract
            ? `Contrato de salida: ${input.outputContract}`
            : "Si faltan datos, señalalo explícitamente.",
          "Contexto:",
          input.context,
        ].join("\n\n"),
      };
    },
  };
}

function buildResearchBundleSummaryPrompt(): PromptDefinition {
  return {
    key: "research.bundle-summary",
    version: "v8-slice-1",
    scope: "research",
    label: "Research Bundle Summary",
    render(input) {
      return {
        systemPrompt:
          "Sos un sintetizador de research. Compactá hallazgos, riesgos y próximos pasos en español claro.",
        userPrompt: [
          "Resumí el bundle priorizando señales accionables.",
          input.outputContract ? `Contrato de salida: ${input.outputContract}` : null,
          "Contexto:",
          input.context,
        ]
          .filter((value): value is string => Boolean(value))
          .join("\n\n"),
      };
    },
  };
}

function buildScoringTicketSynthesisPrompt(
  templateKey: ParlayTemplateKey,
): PromptDefinition {
  const template = getParlayTemplateMetadata(templateKey);

  return {
    key: "scoring.ticket-synthesis",
    version: template.version,
    scope: "scoring",
    label: template.label,
    templateKey,
    render(input) {
      return {
        systemPrompt: [
          "Sos un sintetizador de scoring y decisión.",
          `Template: ${template.key} (${template.version}).`,
          `Foco: ${template.focus}.`,
        ].join(" "),
        userPrompt: [
          "Evaluá la combinación propuesta y explicitá el racional.",
          input.outputContract
            ? `Contrato de salida: ${input.outputContract}`
            : `Respetá el mínimo de ${template.minSelections} selecciones si aplica.`,
          "Contexto:",
          input.context,
        ].join("\n\n"),
      };
    },
  };
}

function buildScoringFixtureSynthesisPrompt(): PromptDefinition {
  return {
    key: "scoring.fixture-synthesis",
    version: "v8-slice-3",
    scope: "scoring",
    label: "Scoring Fixture Synthesis",
    render(input) {
      return {
        systemPrompt:
          "Sos un asistente de scoring deportivo. Explicá la decisión determinística sin cambiar el pick base y señalá riesgos o validaciones operativas.",
        userPrompt: [
          "Usá el contexto para sintetizar una explicación útil, breve y accionable.",
          input.outputContract
            ? `Contrato de salida: ${input.outputContract}`
            : "No inventes datos ni cambies el outcome recomendado.",
          "Contexto:",
          input.context,
        ].join("\n\n"),
      };
    },
  };
}

export const PROMPT_REGISTRY: Record<PromptRegistryKey, readonly PromptDefinition[]> = {
  "research.fixture-analysis": [
    buildResearchFixtureAnalysisPrompt(DEFAULT_ATOMIC_TEMPLATE_KEY),
    buildResearchFixtureAnalysisPrompt("analisis_maestro"),
  ],
  "research.bundle-summary": [buildResearchBundleSummaryPrompt()],
  "scoring.fixture-synthesis": [buildScoringFixtureSynthesisPrompt()],
  "scoring.ticket-synthesis": [
    buildScoringTicketSynthesisPrompt(DEFAULT_PARLAY_TEMPLATE_KEY),
    buildScoringTicketSynthesisPrompt("parlay_valor"),
  ],
};

export function getPromptVersions(
  key: PromptRegistryKey,
): readonly PromptDefinition[] {
  return PROMPT_REGISTRY[key];
}

export function resolvePromptDefinition(
  key: PromptRegistryKey,
  version?: string,
): PromptDefinition {
  const versions = PROMPT_REGISTRY[key];
  const resolved = version
    ? versions.find((entry) => entry.version === version)
    : versions[0];

  if (!resolved) {
    throw new Error(`Prompt ${key} version ${version ?? "latest"} was not found.`);
  }

  return resolved;
}

export function renderPrompt(
  key: PromptRegistryKey,
  input: PromptRenderInput,
  version?: string,
): { systemPrompt: string; userPrompt: string; version: string } {
  const definition = resolvePromptDefinition(key, version);
  const rendered = definition.render(input);

  return {
    ...rendered,
    version: definition.version,
  };
}
