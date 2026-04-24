import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

const canonicalPrinciplesDocPath = "docs/harness-principios-dorados.md";
const requiredCanonicalPrinciplesHeadings = [
  "Objetivo",
  "Alcance",
  "Reglas bloqueantes",
  "Guidelines",
  "Excepciones temporales",
  "Scorecard de entropia",
  "Referencias",
];
const hermesControlPlanePackageName = "@gana-v8/hermes-control-plane";
const hermesControlPlaneWorkspace = "apps/hermes-control-plane";
const codeFileExtensions = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);
const packageDependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const builtinPnpmCommands = new Set([
  "add",
  "config",
  "dlx",
  "exec",
  "install",
  "link",
  "prune",
  "remove",
  "run",
  "store",
  "update",
]);
const localMarkdownLinkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;

const options = parseArgs(process.argv.slice(2));
const repoPath = resolve(options.repoPath);
const findings = await collectFindings(repoPath);
const score = Math.max(
  0,
  100 -
    findings.filter((finding) => finding.severity === "critical").length * 25 -
    findings.filter((finding) => finding.severity === "warn").length * 8,
);

printScorecard(score, findings);

if (options.strict && findings.some((finding) => finding.severity === "critical")) {
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = { repoPath: ".", strict: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (arg === "--repo") {
      parsed.repoPath = args[index + 1] ?? ".";
      index += 1;
      continue;
    }
    parsed.repoPath = arg;
  }

  return parsed;
}

async function collectFindings(repoPath) {
  const findings = [];
  await checkPrinciplesDoc(repoPath, findings);
  await checkAgentsMinimumMap(repoPath, findings);
  await checkRunbookRouting(repoPath, findings);
  await checkRootPnpmCommands(repoPath, findings);
  await checkRuntimeBoundary(repoPath, findings);
  await checkScorecardRegistration(repoPath, findings);
  await checkActivePlanSync(repoPath, findings);
  return findings;
}

async function checkPrinciplesDoc(repoPath, findings) {
  const docPath = resolve(repoPath, canonicalPrinciplesDocPath);
  if (!(await pathExists(docPath))) {
    findings.push({
      severity: "critical",
      label: "principles doc",
      detail: `${canonicalPrinciplesDocPath} is missing`,
      action: "Restore the canonical principles plan or update the lint contract in the same change.",
    });
    return;
  }

  const missingHeadings = missingMarkdownHeadings(
    await readFile(docPath, "utf8"),
    requiredCanonicalPrinciplesHeadings,
  );
  if (missingHeadings.length > 0) {
    findings.push({
      severity: "critical",
      label: "principles doc",
      detail: `missing headings: ${missingHeadings.join(", ")}`,
      action: "Add the missing canonical headings before relying on the principles contract.",
    });
  }
}

async function checkAgentsMinimumMap(repoPath, findings) {
  const agentsPath = resolve(repoPath, "AGENTS.md");
  if (!(await pathExists(agentsPath))) {
    findings.push({
      severity: "critical",
      label: "AGENTS map",
      detail: "AGENTS.md is missing",
      action: "Restore AGENTS.md as the short agent entrypoint.",
    });
    return;
  }

  const agentsContent = await readFile(agentsPath, "utf8");
  let mapPaths;
  try {
    mapPaths = extractCodeListItems(readSection(agentsContent, "Mapa mínimo del repo"));
  } catch (error) {
    findings.push({
      severity: "critical",
      label: "AGENTS map",
      detail: error.message,
      action: "Restore the Mapa minimo del repo section in AGENTS.md.",
    });
    return;
  }

  const missingPaths = [];
  for (const mapPath of mapPaths) {
    if (!(await pathExists(resolve(repoPath, mapPath)))) {
      missingPaths.push(mapPath);
    }
  }

  if (missingPaths.length > 0) {
    findings.push({
      severity: "critical",
      label: "AGENTS map",
      detail: `missing paths: ${missingPaths.join(", ")}`,
      action: "Create the documented paths or remove stale entries from AGENTS.md.",
    });
  }
}

async function checkRunbookRouting(repoPath, findings) {
  const runbooksPath = resolve(repoPath, "runbooks");
  const indexPath = resolve(repoPath, "runbooks/README.md");
  if (!(await pathExists(indexPath))) {
    findings.push({
      severity: "critical",
      label: "runbook routing",
      detail: "runbooks/README.md is missing",
      action: "Restore the runbook index before adding operational procedures.",
    });
    return;
  }

  const runbookNames = await readRunbookNames(runbooksPath);
  const indexContent = await readFile(indexPath, "utf8");
  let indexedRunbooks;
  try {
    indexedRunbooks = extractCodeListItems(readSection(indexContent, "Runbooks operativos activos")).sort();
  } catch (error) {
    findings.push({
      severity: "critical",
      label: "runbook inventory",
      detail: error.message,
      action: "Restore Runbooks operativos activos in runbooks/README.md.",
    });
    return;
  }

  const missingFromIndex = runbookNames.filter((runbookName) => !indexedRunbooks.includes(runbookName));
  const staleIndex = indexedRunbooks.filter((runbookName) => !runbookNames.includes(runbookName));
  if (missingFromIndex.length > 0 || staleIndex.length > 0) {
    findings.push({
      severity: "critical",
      label: "runbook inventory",
      detail: [
        missingFromIndex.length > 0 ? `unindexed: ${missingFromIndex.join(", ")}` : "",
        staleIndex.length > 0 ? `stale index: ${staleIndex.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
      action: "Keep runbooks/README.md active runbooks aligned with markdown files in runbooks/.",
    });
  }

  let routingLinkList;
  let routingLinks;
  try {
    routingLinkList = extractMarkdownLinks(readSection(indexContent, "Routing operativo"))
      .map((target) => target.replace(/^\.\//, ""))
      .filter((target) => target.endsWith(".md"));
    routingLinks = new Set(routingLinkList);
  } catch (error) {
    findings.push({
      severity: "critical",
      label: "runbook routing",
      detail: error.message,
      action: "Restore Routing operativo in runbooks/README.md.",
    });
    return;
  }

  const missingRouting = runbookNames.filter((runbookName) => !routingLinks.has(runbookName));
  const unknownRouting = [...routingLinks].filter((runbookName) => !runbookNames.includes(runbookName));
  const duplicateRouting = [...routingLinks].filter(
    (runbookName) => routingLinkList.filter((linkedRunbookName) => linkedRunbookName === runbookName).length > 1,
  );
  if (missingRouting.length > 0 || unknownRouting.length > 0 || duplicateRouting.length > 0) {
    findings.push({
      severity: "critical",
      label: "runbook routing",
      detail: [
        missingRouting.length > 0 ? `unrouted: ${missingRouting.join(", ")}` : "",
        unknownRouting.length > 0 ? `unknown: ${unknownRouting.join(", ")}` : "",
        duplicateRouting.length > 0 ? `duplicate: ${duplicateRouting.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
      action: "Keep every active runbook represented exactly once in the routing table.",
    });
  }
}

async function checkRootPnpmCommands(repoPath, findings) {
  const packageJson = await readJson(resolve(repoPath, "package.json"));
  const rootScripts = packageJson?.scripts ?? {};
  const docsToCheck = ["AGENTS.md", "README.md"];

  for (const repoRelativePath of docsToCheck) {
    const filePath = resolve(repoPath, repoRelativePath);
    if (!(await pathExists(filePath))) {
      continue;
    }

    const commands = extractRootPnpmCommands(await readFile(filePath, "utf8"));
    const missingCommands = commands.filter((commandName) => !rootScripts[commandName]);
    if (missingCommands.length > 0) {
      findings.push({
        severity: "critical",
        label: "canonical commands",
        detail: `${repoRelativePath} references missing root script(s): ${missingCommands.join(", ")}`,
        action: "Add the root package script or remove the stale pnpm command from the entrypoint docs.",
      });
    }
  }
}

async function checkRuntimeBoundary(repoPath, findings) {
  const packageJsonPaths = await collectPackageJsonFiles(repoPath);
  for (const packageJsonPath of packageJsonPaths) {
    if (isInsideHermesControlPlane(repoPath, packageJsonPath)) {
      continue;
    }

    const packageJson = await readJson(packageJsonPath);
    const dependencyFields = packageDependencyFields.filter(
      (fieldName) => packageJson?.[fieldName]?.[hermesControlPlanePackageName],
    );
    if (dependencyFields.length > 0) {
      findings.push({
        severity: "critical",
        label: "runtime boundary",
        detail: `${toRepoPath(repoPath, packageJsonPath)} depends on ${hermesControlPlanePackageName}`,
        action: "Depend on packages/control-plane-runtime or the split Hermes apps instead.",
      });
    }
  }

  const codeFiles = await collectCodeFiles(repoPath);
  const importViolations = [];
  for (const filePath of codeFiles) {
    if (isInsideHermesControlPlane(repoPath, filePath)) {
      continue;
    }

    const content = await readFile(filePath, "utf8");
    if (importsHermesControlPlane(content)) {
      importViolations.push(toRepoPath(repoPath, filePath));
    }
  }

  if (importViolations.length > 0) {
    findings.push({
      severity: "critical",
      label: "runtime boundary",
      detail: `legacy imports outside compat app: ${importViolations.slice(0, 5).join(", ")}`,
      action: "Route new callers through @gana-v8/control-plane-runtime or the Hermes split apps.",
    });
  }
}

async function checkScorecardRegistration(repoPath, findings) {
  const packageJson = await readJson(resolve(repoPath, "package.json"));
  if (packageJson?.scripts?.["harness:scorecard"] !== "node scripts/harness-entropy-scorecard.mjs") {
    findings.push({
      severity: "warn",
      label: "scorecard script",
      detail: "package.json does not expose harness:scorecard",
      action: "Add harness:scorecard so agents can run the advisory check consistently.",
    });
  }
}

async function checkActivePlanSync(repoPath, findings) {
  const activePlans = await readActivePlanNames(resolve(repoPath, "docs/plans/falta"));
  const readmePlans = await readActivePlansFromReadme(repoPath);
  const agentsPlans = await readActivePlansFromAgents(repoPath);
  const docsPlans = await readActivePlansFromPlansIndex(repoPath);

  const mismatches = [
    listMismatch("README.md", readmePlans, activePlans),
    listMismatch("AGENTS.md", agentsPlans, activePlans),
    listMismatch("docs/plans/README.md", docsPlans, activePlans),
  ].filter(Boolean);

  if (mismatches.length > 0) {
    findings.push({
      severity: "critical",
      label: "active plan sync",
      detail: mismatches.join("; "),
      action: "Synchronize the active plan lists with docs/plans/falta/ in one edit.",
    });
  }
}

async function readActivePlansFromReadme(repoPath) {
  const content = await readFile(resolve(repoPath, "README.md"), "utf8");
  return extractCodeListItems(readSection(content, "Planes clave"))
    .filter((item) => item.startsWith("docs/plans/falta/"))
    .map((item) => item.replace("docs/plans/falta/", ""))
    .sort();
}

async function readActivePlansFromAgents(repoPath) {
  const content = await readFile(resolve(repoPath, "AGENTS.md"), "utf8");
  return extractCodeListItems(readSection(content, "Planes activos"))
    .filter((item) => item.startsWith("docs/plans/falta/"))
    .map((item) => item.replace("docs/plans/falta/", ""))
    .sort();
}

async function readActivePlansFromPlansIndex(repoPath) {
  const content = await readFile(resolve(repoPath, "docs/plans/README.md"), "utf8");
  return extractCodeListItems(readSection(content, "Planes vigentes en `falta/`")).sort();
}

function listMismatch(label, actual, expected) {
  if (actual.length === expected.length && actual.every((item, index) => item === expected[index])) {
    return null;
  }

  return `${label} expected [${expected.join(", ")}], found [${actual.join(", ")}]`;
}

function printScorecard(score, findings) {
  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const warningCount = findings.filter((finding) => finding.severity === "warn").length;
  console.log(`Harness entropy scorecard: ${score}/100 (${criticalCount} critical, ${warningCount} warnings)`);

  if (findings.length === 0) {
    console.log("Action: no immediate cleanup required.");
    return;
  }

  for (const finding of findings.slice(0, 8)) {
    console.log(`- ${finding.severity.toUpperCase()} ${finding.label}: ${finding.detail}`);
    console.log(`  Action: ${finding.action}`);
  }

  if (findings.length > 8) {
    console.log(`- INFO output trimmed: ${findings.length - 8} additional finding(s).`);
    console.log("  Action: run workspace lint for the full blocking detail.");
  }
}

async function readActivePlanNames(activePlansPath) {
  if (!(await pathExists(activePlansPath))) {
    return [];
  }

  const entries = await readdir(activePlansPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

async function readRunbookNames(runbooksPath) {
  if (!(await pathExists(runbooksPath))) {
    return [];
  }

  const entries = await readdir(runbooksPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => entry.name)
    .sort();
}

function readSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const collected = [];
  let insideSection = false;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (insideSection) {
        break;
      }
      insideSection = line.slice(3).trim() === heading;
      continue;
    }
    if (insideSection) {
      collected.push(line);
    }
  }

  if (!insideSection) {
    throw new Error(`missing section: ${heading}`);
  }

  return collected.join("\n");
}

function extractCodeListItems(markdownSection) {
  return [...markdownSection.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
}

function extractMarkdownLinks(markdownSection) {
  return [...markdownSection.matchAll(localMarkdownLinkPattern)]
    .map((match) => stripMarkdownLinkDecorators(match[1]?.trim() ?? "").split("#")[0])
    .filter(Boolean);
}

function extractRootPnpmCommands(markdown) {
  const commands = new Set();
  const commandPattern = /(?:^|\s)(?:[A-Z_][A-Z0-9_]*=[^\s]+\s+)*pnpm\s+([^\s`]+)/gm;

  for (const match of markdown.matchAll(commandPattern)) {
    const commandName = match[1]?.trim();
    if (
      !commandName ||
      commandName.startsWith("-") ||
      commandName.includes("/") ||
      commandName === "prisma" ||
      builtinPnpmCommands.has(commandName)
    ) {
      continue;
    }
    commands.add(commandName);
  }

  return [...commands].sort();
}

function missingMarkdownHeadings(markdown, requiredHeadings) {
  const headings = new Set(
    markdown
      .split(/\r?\n/)
      .filter((line) => /^#{1,6}\s+/.test(line))
      .map((line) => line.replace(/^#{1,6}\s+/, "").trim()),
  );
  return requiredHeadings.filter((heading) => !hasHeading(headings, heading));
}

function hasHeading(headings, requiredHeading) {
  return [...headings].some(
    (heading) => heading === requiredHeading || heading.startsWith(`${requiredHeading} (`),
  );
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function collectPackageJsonFiles(repoPath) {
  return collectFiles(repoPath, (entryPath, entry) => entry.isFile() && entry.name === "package.json");
}

async function collectCodeFiles(repoPath) {
  return collectFiles(repoPath, (entryPath, entry) => entry.isFile() && codeFileExtensions.has(extname(entry.name)));
}

async function collectFiles(directoryPath, shouldInclude) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        continue;
      }
      files.push(...(await collectFiles(entryPath, shouldInclude)));
      continue;
    }
    if (shouldInclude(entryPath, entry)) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function shouldSkipDirectory(directoryName) {
  return [".artifacts", ".git", ".turbo", "dist", "node_modules"].includes(directoryName);
}

function isInsideHermesControlPlane(repoPath, filePath) {
  const repoRelativePath = toPosixPath(relative(repoPath, filePath));
  return repoRelativePath === hermesControlPlaneWorkspace || repoRelativePath.startsWith(`${hermesControlPlaneWorkspace}/`);
}

function importsHermesControlPlane(content) {
  return new RegExp(
    `(?:from\\s+["']${escapeRegExp(hermesControlPlanePackageName)}(?:/[^"']*)?["']|import\\s*\\(\\s*["']${escapeRegExp(hermesControlPlanePackageName)}(?:/[^"']*)?["']\\s*\\)|require\\s*\\(\\s*["']${escapeRegExp(hermesControlPlanePackageName)}(?:/[^"']*)?["']\\s*\\))`,
  ).test(content);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripMarkdownLinkDecorators(target) {
  return target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function toRepoPath(repoPath, filePath) {
  return toPosixPath(filePath.replace(`${repoPath}/`, ""));
}

function toPosixPath(filePath) {
  return filePath.replaceAll("\\", "/");
}
