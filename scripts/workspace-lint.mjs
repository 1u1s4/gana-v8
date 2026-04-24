import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";

const requiredWorkspaceScripts = ["build", "lint", "test", "typecheck"];
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
const requiredPlanSections = [
  "Estado actual confirmado",
  "Ya cubierto",
  "Faltantes exclusivos",
  "Interfaces/contratos afectados",
  "Dependencias",
  "Criterio de done",
  "Fuentes consolidadas",
];
const requiredAgenticSprintContractSections = [
  "Objetivo",
  "No alcance",
  "Roles",
  "Ownership y worktree",
  "Plan de validacion",
  "Criterio de done",
  "Riesgos",
  "Handoff",
];
const requiredAgenticEvaluationRubricSections = [
  "Version",
  "Baseline",
  "Dimensiones",
  "Thresholds de aprobacion",
  "Evidencia requerida",
  "Salida del evaluador",
  "Reevaluacion",
];
const requiredRunbooksIndexSections = [
  "Runbooks operativos activos",
  "Routing operativo",
  "Matriz canonica de bootstrap y preparacion",
  "Doc-gardening recurrente",
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

const args = process.argv.slice(2);

if (args[0] === "--repo") {
  await lintRepo(resolve(args[1] ?? "."));
} else {
  await lintWorkspace(resolve(args[0] ?? "."));
}

async function lintWorkspace(workspacePath) {
  const packageJson = JSON.parse(await readFile(resolve(workspacePath, "package.json"), "utf8"));
  const missingScripts = requiredWorkspaceScripts.filter((script) => !packageJson.scripts?.[script]);
  if (missingScripts.length > 0) {
    throw new Error(`${packageJson.name} is missing scripts: ${missingScripts.join(", ")}`);
  }
  if (!packageJson.exports?.["."]?.import) {
    throw new Error(`${packageJson.name} is missing an ESM export target`);
  }
  if (!packageJson.files?.includes("dist")) {
    throw new Error(`${packageJson.name} should publish its dist directory`);
  }
  console.log(`lint ok: ${packageJson.name}`);
}

async function lintRepo(repoPath) {
  await assertExists(resolve(repoPath, "AGENTS.md"), "AGENTS.md");
  await assertExists(resolve(repoPath, "README.md"), "README.md");
  await assertExists(resolve(repoPath, "docs/README.md"), "docs/README.md");
  await assertExists(resolve(repoPath, "docs/agentic-handoff.md"), "docs/agentic-handoff.md");
  await assertExists(resolve(repoPath, "docs/agentic-sprint-contract.md"), "docs/agentic-sprint-contract.md");
  await assertExists(resolve(repoPath, "docs/agentic-evaluation-rubric.md"), "docs/agentic-evaluation-rubric.md");
  await assertExists(resolve(repoPath, "docs/plans/README.md"), "docs/plans/README.md");
  await assertExists(resolve(repoPath, "runbooks"), "runbooks/");
  await assertExists(resolve(repoPath, "runbooks/README.md"), "runbooks/README.md");

  await lintCanonicalPrinciplesDoc(repoPath);

  await assertMarkdownHeadings(
    await readFile(resolve(repoPath, "docs/agentic-sprint-contract.md"), "utf8"),
    "docs/agentic-sprint-contract.md",
    requiredAgenticSprintContractSections,
  );
  await assertMarkdownHeadings(
    await readFile(resolve(repoPath, "docs/agentic-evaluation-rubric.md"), "utf8"),
    "docs/agentic-evaluation-rubric.md",
    requiredAgenticEvaluationRubricSections,
  );

  const runbookNames = await readRunbookNames(resolve(repoPath, "runbooks"));
  if (runbookNames.length === 0) {
    throw new Error("runbooks/ should contain at least one markdown runbook");
  }

  const runbooksIndexContent = await readFile(resolve(repoPath, "runbooks/README.md"), "utf8");
  assertMarkdownHeadings(runbooksIndexContent, "runbooks/README.md", requiredRunbooksIndexSections);
  const indexedRunbooks = extractCodeListItems(readSection(runbooksIndexContent, "Runbooks operativos activos")).sort();
  assertRunbookRoutingCoverage(runbooksIndexContent, runbookNames);
  assertSameList("runbooks/README.md active runbooks", indexedRunbooks, runbookNames, "runbooks/");

  const activePlans = await readActivePlanNames(resolve(repoPath, "docs/plans/falta"));
  for (const planName of activePlans) {
    const planPath = resolve(repoPath, "docs/plans/falta", planName);
    const content = await readFile(planPath, "utf8");
    assertMarkdownHeadings(content, planName, requiredPlanSections);
  }

  const readmeContent = await readFile(resolve(repoPath, "README.md"), "utf8");
  const readmePlans = extractCodeListItems(readSection(readmeContent, "Planes clave"))
    .filter((item) => item.startsWith("docs/plans/falta/"))
    .map((item) => item.replace("docs/plans/falta/", ""))
    .sort();
  assertSameList("README.md active plans", readmePlans, activePlans, "docs/plans/falta/");

  const plansReadmeContent = await readFile(resolve(repoPath, "docs/plans/README.md"), "utf8");
  const indexedPlans = extractCodeListItems(readSection(plansReadmeContent, "Planes vigentes en `falta/`")).sort();
  assertSameList("docs/plans/README.md active plans", indexedPlans, activePlans, "docs/plans/falta/");

  const agentsContent = await readFile(resolve(repoPath, "AGENTS.md"), "utf8");
  await lintAgentsMinimumMap(repoPath, agentsContent);
  const agentsPlans = extractCodeListItems(readSection(agentsContent, "Planes activos"))
    .filter((item) => item.startsWith("docs/plans/falta/"))
    .map((item) => item.replace("docs/plans/falta/", ""))
    .sort();
  assertSameList("AGENTS.md active plans", agentsPlans, activePlans, "docs/plans/falta/");

  const markdownFiles = await collectMarkdownFiles(repoPath);
  for (const filePath of markdownFiles) {
    await lintMarkdownLinks(repoPath, filePath);
  }
  await lintRootPnpmCommands(repoPath, [resolve(repoPath, "AGENTS.md"), resolve(repoPath, "README.md")]);
  await lintOperationalCommandDrift(repoPath);
  await lintRuntimeBoundary(repoPath);

  console.log(`repo lint ok: ${activePlans.length} active plans, ${markdownFiles.length} markdown files checked`);
}

async function lintCanonicalPrinciplesDoc(repoPath) {
  const principlesDoc = resolve(repoPath, canonicalPrinciplesDocPath);
  await assertExists(principlesDoc, canonicalPrinciplesDocPath);
  assertMarkdownHeadings(
    await readFile(principlesDoc, "utf8"),
    canonicalPrinciplesDocPath,
    requiredCanonicalPrinciplesHeadings,
  );
}

async function readActivePlanNames(activePlansPath) {
  await assertExists(activePlansPath, "docs/plans/falta/");
  const entries = await readdir(activePlansPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

async function readRunbookNames(runbooksPath) {
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
    throw new Error(`Missing section: ${heading}`);
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

function assertRunbookRoutingCoverage(runbooksIndexContent, runbookNames) {
  const routingLinkList = extractMarkdownLinks(readSection(runbooksIndexContent, "Routing operativo"))
    .map((target) => target.replace(/^\.\//, ""))
    .filter((target) => target.endsWith(".md"));
  const routingLinks = new Set(routingLinkList);
  const missingRouting = runbookNames.filter((runbookName) => !routingLinks.has(runbookName));
  if (missingRouting.length > 0) {
    throw new Error(`runbooks/README.md routing is missing runbook(s): ${missingRouting.join(", ")}`);
  }

  const unknownRouting = [...routingLinks].filter((runbookName) => !runbookNames.includes(runbookName));
  if (unknownRouting.length > 0) {
    throw new Error(`runbooks/README.md routing references non-active runbook(s): ${unknownRouting.join(", ")}`);
  }

  const duplicateRouting = [...routingLinks].filter(
    (runbookName) => routingLinkList.filter((linkedRunbookName) => linkedRunbookName === runbookName).length > 1,
  );
  if (duplicateRouting.length > 0) {
    throw new Error(`runbooks/README.md routing repeats runbook(s): ${duplicateRouting.join(", ")}`);
  }
}

async function lintAgentsMinimumMap(repoPath, agentsContent) {
  const minimumMapPaths = extractCodeListItems(readSection(agentsContent, "Mapa mínimo del repo"));
  for (const mapPath of minimumMapPaths) {
    await assertExists(resolve(repoPath, mapPath), `AGENTS.md Mapa mínimo path ${mapPath}`);
  }
}

async function lintRootPnpmCommands(repoPath, filePaths) {
  const rootPackageJson = JSON.parse(await readFile(resolve(repoPath, "package.json"), "utf8"));
  const rootScripts = rootPackageJson.scripts ?? {};

  for (const filePath of filePaths) {
    const content = await readFile(filePath, "utf8");
    for (const commandName of extractRootPnpmCommands(content)) {
      if (!rootScripts[commandName]) {
        throw new Error(
          `${toRepoPath(repoPath, filePath)} references pnpm ${commandName}, but package.json has no root script named ${commandName}`,
        );
      }
    }
  }
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

async function lintRuntimeBoundary(repoPath) {
  const packageJsonPaths = await collectPackageJsonFiles(repoPath);
  for (const packageJsonPath of packageJsonPaths) {
    const repoRelativePackageJsonPath = toRepoPath(repoPath, packageJsonPath);
    if (isInsideHermesControlPlane(repoPath, packageJsonPath)) {
      continue;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    const dependencyFields = packageDependencyFields.filter(
      (fieldName) => packageJson[fieldName]?.[hermesControlPlanePackageName],
    );
    if (dependencyFields.length > 0) {
      throw new Error(
        `${repoRelativePackageJsonPath} must not depend on ${hermesControlPlanePackageName} (${dependencyFields.join(", ")})`,
      );
    }
  }

  const codeFiles = await collectCodeFiles(repoPath);
  for (const filePath of codeFiles) {
    if (isInsideHermesControlPlane(repoPath, filePath)) {
      continue;
    }

    const content = await readFile(filePath, "utf8");
    if (importsHermesControlPlane(content)) {
      throw new Error(`${toRepoPath(repoPath, filePath)} must not import ${hermesControlPlanePackageName}`);
    }
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

function assertMarkdownHeadings(markdown, label, requiredHeadings) {
  const headings = new Set(
    markdown
      .split(/\r?\n/)
      .filter((line) => /^#{1,6}\s+/.test(line))
      .map((line) => line.replace(/^#{1,6}\s+/, "").trim()),
  );
  const missingHeadings = requiredHeadings.filter((heading) => !hasHeading(headings, heading));
  if (missingHeadings.length > 0) {
    throw new Error(`${label} is missing heading(s): ${missingHeadings.join(", ")}`);
  }
}

function hasHeading(headings, requiredHeading) {
  return [...headings].some(
    (heading) => heading === requiredHeading || heading.startsWith(`${requiredHeading} (`),
  );
}

function assertSameList(label, actual, expected, expectedSource) {
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(`${label} do not match ${expectedSource}: expected [${expected.join(", ")}], received [${actual.join(", ")}]`);
  }
}

async function collectMarkdownFiles(repoPath) {
  const markdownFiles = [resolve(repoPath, "AGENTS.md"), resolve(repoPath, "README.md")];
  markdownFiles.push(...(await walkMarkdownTree(resolve(repoPath, "docs"))));
  markdownFiles.push(...(await walkMarkdownTree(resolve(repoPath, "runbooks"))));
  return markdownFiles.sort();
}

async function walkMarkdownTree(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const markdownFiles = [];

  for (const entry of entries) {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) {
      markdownFiles.push(...(await walkMarkdownTree(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownFiles.push(entryPath);
    }
  }

  return markdownFiles;
}

async function lintMarkdownLinks(repoPath, filePath) {
  const content = await readFile(filePath, "utf8");
  for (const match of content.matchAll(localMarkdownLinkPattern)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget || shouldSkipLink(rawTarget)) {
      continue;
    }

    const linkTarget = stripMarkdownLinkDecorators(rawTarget).split("#")[0];
    if (!linkTarget) {
      continue;
    }

    const resolvedTarget = resolve(dirname(filePath), linkTarget);
    if (!(await pathExists(resolvedTarget))) {
      throw new Error(`Broken local markdown link in ${toRepoPath(repoPath, filePath)}: ${rawTarget}`);
    }
  }
}

async function lintOperationalCommandDrift(repoPath) {
  const allowedDbPushFile = resolve(repoPath, "runbooks/README.md");
  const operationalMarkdownFiles = [
    resolve(repoPath, "AGENTS.md"),
    resolve(repoPath, "README.md"),
    resolve(repoPath, "docs/README.md"),
    ...(await walkMarkdownTree(resolve(repoPath, "runbooks"))),
  ];

  for (const filePath of operationalMarkdownFiles) {
    const content = await readFile(filePath, "utf8");
    const headings = extractMarkdownHeadings(content);

    if (filePath !== allowedDbPushFile && content.includes("pnpm db:push")) {
      throw new Error(`pnpm db:push is only allowed in runbooks/README.md: ${toRepoPath(repoPath, filePath)}`);
    }

    if (filePath !== allowedDbPushFile && headings.has("Runbooks operativos activos")) {
      throw new Error(`Runbook inventory should live only in runbooks/README.md: ${toRepoPath(repoPath, filePath)}`);
    }
  }
}

function extractMarkdownHeadings(markdown) {
  return new Set(
    markdown
      .split(/\r?\n/)
      .filter((line) => /^#{1,6}\s+/.test(line))
      .map((line) => line.replace(/^#{1,6}\s+/, "").trim()),
  );
}

function shouldSkipLink(target) {
  return (
    target.startsWith("#") ||
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("app://")
  );
}

function stripMarkdownLinkDecorators(target) {
  return target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
}

async function assertExists(path, label) {
  if (!(await pathExists(path))) {
    throw new Error(`${label} is required`);
  }
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
