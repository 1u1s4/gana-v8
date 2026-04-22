import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const requiredWorkspaceScripts = ["build", "lint", "test", "typecheck"];
const requiredPlanSections = [
  "Estado actual confirmado",
  "Ya cubierto",
  "Faltantes exclusivos",
  "Interfaces/contratos afectados",
  "Dependencias",
  "Criterio de done",
  "Fuentes consolidadas",
];
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
  await assertExists(resolve(repoPath, "docs/plans/README.md"), "docs/plans/README.md");
  await assertExists(resolve(repoPath, "runbooks"), "runbooks/");

  const runbookEntries = await readdir(resolve(repoPath, "runbooks"), { withFileTypes: true });
  const runbookCount = runbookEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
  if (runbookCount === 0) {
    throw new Error("runbooks/ should contain at least one markdown runbook");
  }

  const activePlans = await readActivePlanNames(resolve(repoPath, "docs/plans/falta"));
  if (activePlans.length === 0) {
    throw new Error("docs/plans/falta/ should contain at least one active plan");
  }

  for (const planName of activePlans) {
    const planPath = resolve(repoPath, "docs/plans/falta", planName);
    const content = await readFile(planPath, "utf8");
    for (const section of requiredPlanSections) {
      if (!content.includes(section)) {
        throw new Error(`${planName} is missing section: ${section}`);
      }
    }
  }

  const readmeContent = await readFile(resolve(repoPath, "README.md"), "utf8");
  const readmePlans = extractCodeListItems(readSection(readmeContent, "Planes clave"))
    .filter((item) => item.startsWith("docs/plans/falta/"))
    .map((item) => item.replace("docs/plans/falta/", ""))
    .sort();
  assertSameList("README.md active plans", readmePlans, activePlans);

  const plansReadmeContent = await readFile(resolve(repoPath, "docs/plans/README.md"), "utf8");
  const indexedPlans = extractCodeListItems(readSection(plansReadmeContent, "Planes vigentes en `falta/`")).sort();
  assertSameList("docs/plans/README.md active plans", indexedPlans, activePlans);

  const markdownFiles = await collectMarkdownFiles(repoPath);
  for (const filePath of markdownFiles) {
    await lintMarkdownLinks(repoPath, filePath);
  }

  console.log(`repo lint ok: ${activePlans.length} active plans, ${markdownFiles.length} markdown files checked`);
}

async function readActivePlanNames(activePlansPath) {
  await assertExists(activePlansPath, "docs/plans/falta/");
  const entries = await readdir(activePlansPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
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

function assertSameList(label, actual, expected) {
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(`${label} do not match docs/plans/falta/: expected [${expected.join(", ")}], received [${actual.join(", ")}]`);
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
  return filePath.replace(`${repoPath}/`, "");
}
