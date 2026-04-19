export const ATOMIC_TEMPLATE_KEYS = ["refinado", "analisis_maestro"] as const;
export type AtomicTemplateKey = (typeof ATOMIC_TEMPLATE_KEYS)[number];

export const PARLAY_TEMPLATE_KEYS = [
  "parlay_conservador",
  "parlay_balanceado",
  "parlay_maximo",
  "parlay_escalera",
  "parlay_valor",
] as const;
export type ParlayTemplateKey = (typeof PARLAY_TEMPLATE_KEYS)[number];

export interface AtomicTemplateMetadata {
  readonly key: AtomicTemplateKey;
  readonly label: string;
  readonly code: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly focus: string;
  readonly version: string;
  readonly isDefault?: boolean;
}

export interface ParlayTemplateMetadata {
  readonly key: ParlayTemplateKey;
  readonly label: string;
  readonly code: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly focus: string;
  readonly minSelections: number;
  readonly version: string;
  readonly isDefault?: boolean;
}

export const ATOMIC_TEMPLATE_CATALOG: Record<
  AtomicTemplateKey,
  AtomicTemplateMetadata
> = {
  refinado: {
    key: "refinado",
    label: "Refinado",
    code: "REF",
    shortLabel: "REF",
    description:
      "Sintetiza el contexto y prioriza un pick prudente, explicable y utilizable en research.",
    focus: "síntesis y decisión prudente",
    version: "v8-slice-1",
    isDefault: true,
  },
  analisis_maestro: {
    key: "analisis_maestro",
    label: "Análisis Maestro",
    code: "MAES",
    shortLabel: "MAES",
    description:
      "Evalúa escenarios, líneas y relación riesgo-retorno antes de elegir el mejor ángulo.",
    focus: "análisis comparativo y selección del mejor ángulo",
    version: "v8-slice-1",
  },
};

export const PARLAY_TEMPLATE_CATALOG: Record<
  ParlayTemplateKey,
  ParlayTemplateMetadata
> = {
  parlay_conservador: {
    key: "parlay_conservador",
    label: "Parlay Conservador",
    code: "CON",
    shortLabel: "CON",
    description: "2-3 patas, máxima seguridad y baja exposición a correlación.",
    focus: "máxima probabilidad de acierto",
    minSelections: 2,
    version: "v8-slice-1",
  },
  parlay_balanceado: {
    key: "parlay_balanceado",
    label: "Parlay Balanceado",
    code: "BAL",
    shortLabel: "BAL",
    description:
      "3-4 patas con equilibrio entre anclas seguras y una pata que mejore retorno.",
    focus: "equilibrio entre probabilidad y retorno",
    minSelections: 3,
    version: "v8-slice-1",
    isDefault: true,
  },
  parlay_maximo: {
    key: "parlay_maximo",
    label: "Parlay Máximo",
    code: "MAX",
    shortLabel: "MAX",
    description:
      "5+ patas sólo si la combinación sigue siendo viable y diversificada.",
    focus: "máximo número de patas con viabilidad todavía razonable",
    minSelections: 5,
    version: "v8-slice-1",
  },
  parlay_escalera: {
    key: "parlay_escalera",
    label: "Parlay Escalera",
    code: "ESC",
    shortLabel: "ESC",
    description:
      "1-3 patas ultra seguras con cuota total baja para estrategias compuestas.",
    focus: "cuota baja y probabilidad extrema",
    minSelections: 1,
    version: "v8-slice-1",
  },
  parlay_valor: {
    key: "parlay_valor",
    label: "Parlay Valor",
    code: "VAL",
    shortLabel: "VAL",
    description:
      "3-5 patas donde la lectura estima más probabilidad que la implícita del mercado.",
    focus: "ineficiencias del mercado y retorno alto",
    minSelections: 3,
    version: "v8-slice-1",
  },
};

export const DEFAULT_ATOMIC_TEMPLATE_KEY =
  ATOMIC_TEMPLATE_KEYS.find((key) => ATOMIC_TEMPLATE_CATALOG[key].isDefault) ??
  ATOMIC_TEMPLATE_KEYS[0];

export const DEFAULT_PARLAY_TEMPLATE_KEY =
  PARLAY_TEMPLATE_KEYS.find((key) => PARLAY_TEMPLATE_CATALOG[key].isDefault) ??
  PARLAY_TEMPLATE_KEYS[0];

export const ATOMIC_TEMPLATE_OPTIONS = Object.values(ATOMIC_TEMPLATE_CATALOG);
export const PARLAY_TEMPLATE_OPTIONS = Object.values(PARLAY_TEMPLATE_CATALOG);

export function isAtomicTemplateKey(value: unknown): value is AtomicTemplateKey {
  return (
    typeof value === "string" &&
    ATOMIC_TEMPLATE_KEYS.includes(value as AtomicTemplateKey)
  );
}

export function isParlayTemplateKey(value: unknown): value is ParlayTemplateKey {
  return (
    typeof value === "string" &&
    PARLAY_TEMPLATE_KEYS.includes(value as ParlayTemplateKey)
  );
}

export function getAtomicTemplateMetadata(
  template: AtomicTemplateKey,
): AtomicTemplateMetadata {
  return ATOMIC_TEMPLATE_CATALOG[template];
}

export function getParlayTemplateMetadata(
  template: ParlayTemplateKey,
): ParlayTemplateMetadata {
  return PARLAY_TEMPLATE_CATALOG[template];
}

export function canUseParlayTemplate(
  template: ParlayTemplateKey,
  selectionCount: number,
): boolean {
  return selectionCount >= PARLAY_TEMPLATE_CATALOG[template].minSelections;
}

export function normalizeParlayTemplateSelection(
  values: readonly ParlayTemplateKey[],
): ParlayTemplateKey[] {
  const deduped = [...new Set(values.filter(isParlayTemplateKey))];
  return deduped.length > 0 ? deduped : [DEFAULT_PARLAY_TEMPLATE_KEY];
}
