export const workspaceInfo = {
  packageName: "@gana-v8/publication-engine",
  workspaceName: "publication-engine",
  category: "package",
  description: "Publication governance gates for lineage, channel pauses, kill switches, and authz.",
  dependencies: [
    { name: "@gana-v8/authz", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
    { name: "@gana-v8/prediction-engine", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export const publicationChannels = [
  "preview-store",
  "parlay-store",
  "telegram",
  "discord",
  "webhook",
] as const;
export type PublicationChannel = (typeof publicationChannels)[number];

export const publicationCapabilities = [
  "publish:preview",
  "publish:parlay-store",
  "publish:telegram",
  "publish:discord",
  "publish:webhook",
  "queue:operate",
  "workflow:override",
  "*",
] as const;
export type PublicationCapability = (typeof publicationCapabilities)[number];

export interface PublicationActor {
  readonly id: string;
  readonly capabilities: readonly PublicationCapability[];
}

export interface PublicationLineage {
  readonly environment: string;
  readonly profile: string;
  readonly providerSource?: string;
  readonly demoMode: boolean;
  readonly cohort: string;
  readonly source: string;
}

export interface PublicationGateConfig {
  readonly channelStates?: Partial<Record<PublicationChannel, "enabled" | "paused">>;
  readonly capabilityKillSwitches?: Partial<Record<PublicationCapability, boolean>>;
  readonly allowUnknownLineageForLiveChannels?: boolean;
}

export interface PublicationDecisionReason {
  readonly code:
    | "channel-paused"
    | "kill-switch-enabled"
    | "missing-capability"
    | "missing-lineage"
    | "mixed-lineage"
    | "non-live-lineage";
  readonly message: string;
}

export interface PublicationDecision {
  readonly allowed: boolean;
  readonly channel: PublicationChannel;
  readonly liveChannel: boolean;
  readonly requiredCapability: PublicationCapability;
  readonly normalizedLineage?: PublicationLineage;
  readonly normalizedSourceLineages: readonly PublicationLineage[];
  readonly reasons: readonly PublicationDecisionReason[];
}

export interface EvaluatePublicationReadinessInput {
  readonly channel: PublicationChannel;
  readonly actor?: PublicationActor;
  readonly lineage?: Partial<PublicationLineage>;
  readonly sourceLineages?: readonly (Partial<PublicationLineage> | null | undefined)[];
  readonly requiredCapability?: PublicationCapability;
  readonly gateConfig?: PublicationGateConfig;
}

const liveChannels = new Set<PublicationChannel>(["parlay-store", "telegram", "discord", "webhook"]);

const defaultCapabilityByChannel: Readonly<Record<PublicationChannel, PublicationCapability>> = {
  "preview-store": "publish:preview",
  "parlay-store": "publish:parlay-store",
  telegram: "publish:telegram",
  discord: "publish:discord",
  webhook: "publish:webhook",
};

const deniedLineageMarkers = ["demo", "sandbox", "ci", "backtest", "local-dev", "mock", "replay"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasCapability = (
  actor: PublicationActor | undefined,
  capability: PublicationCapability,
): boolean => !!actor && (actor.capabilities.includes("*") || actor.capabilities.includes(capability));

export const normalizePublicationLineage = (
  lineage: Partial<PublicationLineage> | null | undefined,
): PublicationLineage | null => {
  if (!lineage || !isRecord(lineage)) {
    return null;
  }

  if (
    typeof lineage.environment !== "string" ||
    typeof lineage.profile !== "string" ||
    typeof lineage.demoMode !== "boolean" ||
    typeof lineage.cohort !== "string" ||
    typeof lineage.source !== "string"
  ) {
    return null;
  }

  return {
    environment: lineage.environment,
    profile: lineage.profile,
    ...(typeof lineage.providerSource === "string" ? { providerSource: lineage.providerSource } : {}),
    demoMode: lineage.demoMode,
    cohort: lineage.cohort,
    source: lineage.source,
  };
};

export const isLivePublicationLineage = (lineage: PublicationLineage): boolean => {
  if (lineage.demoMode) {
    return false;
  }

  const haystack = [lineage.environment, lineage.profile, lineage.providerSource ?? "", lineage.cohort, lineage.source]
    .join(" ")
    .toLowerCase();

  if (deniedLineageMarkers.some((marker) => haystack.includes(marker))) {
    return false;
  }

  return (
    ["production", "staging"].includes(lineage.environment.toLowerCase()) ||
    ["production", "staging-like"].includes(lineage.profile.toLowerCase())
  );
};

const stableLineageKey = (lineage: PublicationLineage): string =>
  JSON.stringify([
    lineage.environment,
    lineage.profile,
    lineage.providerSource ?? null,
    lineage.demoMode,
    lineage.cohort,
    lineage.source,
  ]);

export const evaluatePublicationReadiness = (
  input: EvaluatePublicationReadinessInput,
): PublicationDecision => {
  const requiredCapability = input.requiredCapability ?? defaultCapabilityByChannel[input.channel];
  const liveChannel = liveChannels.has(input.channel);
  const normalizedLineage = normalizePublicationLineage(input.lineage);
  const normalizedSourceLineages = [
    ...new Map(
      (input.sourceLineages ?? [])
        .map((entry) => normalizePublicationLineage(entry))
        .filter((entry): entry is PublicationLineage => entry !== null)
        .map((entry) => [stableLineageKey(entry), entry]),
    ).values(),
  ];
  const reasons: PublicationDecisionReason[] = [];

  if (input.gateConfig?.channelStates?.[input.channel] === "paused") {
    reasons.push({
      code: "channel-paused",
      message: `Publication channel ${input.channel} is paused by governance config.`,
    });
  }

  if (input.gateConfig?.capabilityKillSwitches?.[requiredCapability] === true) {
    reasons.push({
      code: "kill-switch-enabled",
      message: `Capability ${requiredCapability} is disabled by kill switch.`,
    });
  }

  if (!hasCapability(input.actor, requiredCapability)) {
    reasons.push({
      code: "missing-capability",
      message: `Actor ${input.actor?.id ?? "anonymous"} lacks capability ${requiredCapability}.`,
    });
  }

  if (liveChannel) {
    const effectiveLineages = normalizedSourceLineages.length > 0
      ? normalizedSourceLineages
      : normalizedLineage
        ? [normalizedLineage]
        : [];

    if (effectiveLineages.length === 0 && input.gateConfig?.allowUnknownLineageForLiveChannels !== true) {
      reasons.push({
        code: "missing-lineage",
        message: `Live publication on ${input.channel} requires explicit lineage.`,
      });
    }

    if (effectiveLineages.length > 1) {
      reasons.push({
        code: "mixed-lineage",
        message: `Live publication on ${input.channel} cannot mix multiple source lineages.`,
      });
    }

    if (effectiveLineages.some((lineage) => !isLivePublicationLineage(lineage))) {
      reasons.push({
        code: "non-live-lineage",
        message: `Live publication on ${input.channel} rejected because at least one source lineage is non-live/demo.`,
      });
    }
  }

  return {
    allowed: reasons.length === 0,
    channel: input.channel,
    liveChannel,
    requiredCapability,
    ...(normalizedLineage ? { normalizedLineage } : {}),
    normalizedSourceLineages,
    reasons,
  };
};
