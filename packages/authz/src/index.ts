export const workspaceInfo = {
  packageName: "@gana-v8/authz",
  workspaceName: "authz",
  category: "package",
  description: "Basic authorization actors, roles, and capability checks for operational surfaces.",
  dependencies: [
    { name: "@gana-v8/domain-core", category: "workspace" },
    { name: "@gana-v8/policy-engine", category: "workspace" },
  ],
} as const;

export function describeWorkspace() {
  return `${workspaceInfo.workspaceName} (${workspaceInfo.category})`;
}

export const authorizationRoles = ["viewer", "operator", "automation", "system"] as const;
export type AuthorizationRole = (typeof authorizationRoles)[number];

export const authorizationCapabilities = [
  "publish:preview",
  "publish:parlay-store",
  "publish:telegram",
  "publish:discord",
  "publish:webhook",
  "queue:operate",
  "release:approve",
  "workflow:override",
  "*",
] as const;
export type AuthorizationCapability = (typeof authorizationCapabilities)[number];

export interface AuthorizationActor {
  readonly id: string;
  readonly role: AuthorizationRole;
  readonly capabilities: readonly AuthorizationCapability[];
  readonly displayName?: string;
}

const defaultCapabilitiesByRole: Readonly<Record<AuthorizationRole, readonly AuthorizationCapability[]>> = {
  viewer: [],
  operator: [
    "publish:preview",
    "publish:parlay-store",
    "publish:telegram",
    "publish:discord",
    "publish:webhook",
    "queue:operate",
    "release:approve",
    "workflow:override",
  ],
  automation: [
    "publish:preview",
    "publish:parlay-store",
    "publish:telegram",
    "publish:discord",
    "publish:webhook",
  ],
  system: ["*"],
};

export const createAuthorizationActor = (
  input: Pick<AuthorizationActor, "id" | "role"> &
    Partial<Pick<AuthorizationActor, "capabilities" | "displayName">>,
): AuthorizationActor => ({
  id: input.id,
  role: input.role,
  capabilities: [...new Set(input.capabilities ?? defaultCapabilitiesByRole[input.role])],
  ...(input.displayName ? { displayName: input.displayName } : {}),
});

export const automationActor = (id = "automation:system", displayName = "Automation System"): AuthorizationActor =>
  createAuthorizationActor({ id, role: "automation", displayName });

export const systemActor = (id = "system:internal", displayName = "Internal System"): AuthorizationActor =>
  createAuthorizationActor({ id, role: "system", displayName });

export const hasCapability = (
  actor: AuthorizationActor | undefined,
  capability: AuthorizationCapability,
): boolean => {
  if (!actor) {
    return false;
  }

  return actor.capabilities.includes("*") || actor.capabilities.includes(capability);
};

export const assertCapability = (
  actor: AuthorizationActor | undefined,
  capability: AuthorizationCapability,
  message?: string,
): asserts actor is AuthorizationActor => {
  if (!hasCapability(actor, capability)) {
    const actorLabel = actor?.id ?? "anonymous";
    throw new Error(message ?? `Actor ${actorLabel} lacks capability ${capability}`);
  }
};

export const listActorCapabilities = (actor: AuthorizationActor): readonly AuthorizationCapability[] =>
  actor.capabilities;
