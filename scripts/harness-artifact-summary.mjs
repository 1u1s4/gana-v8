import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

export const harnessArtifactSummarySchemaVersion = "harness-artifact-summary-v1";

export const harnessFailureCategories = new Set([
  "golden-drift",
  "runtime-drift",
  "broken-link",
  "invalid-command",
  "service-unavailable",
  "authz",
  "readiness",
  "db-migration",
  "provider-live",
  "unknown",
]);

export const createHarnessFailure = ({
  artifactPath,
  category = "unknown",
  cause,
  checkId,
  expected,
  actual,
  ownerType = "agent",
  reproCommand,
  runbook,
}) => {
  const normalizedCategory = harnessFailureCategories.has(category) ? category : "unknown";
  return pruneUndefined({
    actual,
    artifactPath,
    category: normalizedCategory,
    cause,
    checkId,
    expected,
    ownerType,
    reproCommand,
    runbook,
  });
};

export const createHarnessArtifactSummary = ({
  agentActionable = true,
  artifacts = [],
  checks = [],
  command,
  evidenceRoot,
  failures = [],
  finishedAt = new Date().toISOString(),
  flows = [],
  runbooks = [],
  startedAt,
  status,
  summaryKind,
}) => ({
  schemaVersion: harnessArtifactSummarySchemaVersion,
  summaryKind,
  status,
  command,
  startedAt,
  finishedAt,
  evidenceRoot,
  artifacts,
  checks,
  failures,
  flows,
  runbooks,
  agentActionable,
});

export const writeHarnessArtifactSummary = async (summaryPath, summary) => {
  const resolvedPath = resolve(summaryPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return resolvedPath;
};

export const repoRelativePath = (repoRoot, path) => {
  if (!path) {
    return path;
  }
  const resolvedPath = resolve(path);
  const relativePath = relative(repoRoot, resolvedPath);
  return relativePath.startsWith("..") ? resolvedPath : relativePath;
};

const pruneUndefined = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, candidate]) => candidate !== undefined));
