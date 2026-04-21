import test from "node:test";
import assert from "node:assert/strict";

import { createFixture, type AiRunEntity, type FixtureEntity, type TaskEntity } from "@gana-v8/domain-core";

import {
  runResearchSynthesisAi,
  runResearchTask,
  type ResearchWorkerPersistence,
} from "../src/index.js";
import { createCodexHttpProvider, createMockCodexClient } from "@gana-v8/ai-runtime";

const fixture = createFixture({
  id: "fixture:api-football:456",
  sport: "football",
  competition: "Copa Libertadores",
  homeTeam: "Racing Club",
  awayTeam: "Flamengo",
  scheduledAt: "2026-04-18T22:00:00.000Z",
  status: "scheduled",
  metadata: {
    formHome: "0.61",
    formAway: "0.58",
    restHomeDays: "5",
    restAwayDays: "3",
    injuriesHome: "0",
    injuriesAway: "2",
  },
});

const createPersistence = (): ResearchWorkerPersistence & {
  savedFixtures: FixtureEntity[];
  savedTasks: TaskEntity[];
  savedAiRuns: AiRunEntity[];
} => {
  const savedFixtures: FixtureEntity[] = [];
  const savedTasks: TaskEntity[] = [];
  const savedAiRuns: AiRunEntity[] = [];

  return {
    savedFixtures,
    savedTasks,
    savedAiRuns,
    fixtures: {
      async save(entity) {
        savedFixtures.push(entity);
        return entity;
      },
    },
    tasks: {
      async getById(id) {
        return savedTasks.find((item) => item.id === id) ?? null;
      },
      async save(entity) {
        savedTasks.push(entity);
        return entity;
      },
    },
    aiRuns: {
      async save(entity) {
        savedAiRuns.push(entity);
        return entity;
      },
    },
  };
};

test("runResearchSynthesisAi persists rich AiRun metadata on successful structured output", async () => {
  const persistence = createPersistence();
  const result = await runResearchSynthesisAi({
    fixture,
    brief: {
      fixtureId: fixture.id,
      generatedAt: "2026-04-18T12:00:00.000Z",
      headline: "Research brief Racing vs Flamengo",
      context: "Libertadores matchup",
      questions: ["¿Quién llega mejor?"],
      assumptions: ["Usar solo contexto provisto."],
    },
    evidence: [
      {
        id: `${fixture.id}:form`,
        fixtureId: fixture.id,
        kind: "form",
        title: "Current form delta",
        summary: "Racing arrives slightly stronger.",
        direction: "home",
        confidence: 0.68,
        impact: 0.2,
        source: { provider: "fixture-metadata", reference: "formHome/formAway" },
        tags: ["form"],
        extractedAt: "2026-04-18T12:00:00.000Z",
        metadata: {},
      },
    ],
    directionalScore: { home: 0.44, draw: 0.18, away: 0.22 },
    generatedAt: "2026-04-18T12:00:00.000Z",
    config: {
      enabled: true,
      codexAdapter: createCodexHttpProvider({
        client: createMockCodexClient({
          outputText:
            '```json\n{"summary":"Racing llega con ligera ventaja contextual.","risks":["Mercado todavía volátil."]}\n```',
          usage: {
            inputTokens: 101,
            outputTokens: 39,
            totalTokens: 140,
          },
        }),
      }),
    },
    persistence,
  });

  assert.equal(result.structuredOutput.summary, "Racing llega con ligera ventaja contextual.");
  assert.equal(result.aiRun.provider, "codex");
  assert.equal(result.aiRun.status, "completed");
  assert.equal(result.aiRun.providerRequestId, "mock_codex_1");
  assert.equal(result.aiRun.usage?.totalTokens, 140);
  assert.ok(result.aiRun.outputRef?.includes("ai-synthesis.json"));
  assert.equal(result.metadata.synthesisMode, "ai-assisted");
  assert.equal(persistence.savedAiRuns.length, 1);
  assert.equal(persistence.savedTasks.length, 1);
});

test("runResearchTask uses AI structured output and persists trace artifacts without fixture metadata", async () => {
  const persistence = createPersistence();
  const result = await runResearchTask({
    fixture,
    generatedAt: "2026-04-18T12:30:00.000Z",
    persistence,
    ai: {
      enabled: true,
      codexAdapter: createCodexHttpProvider({
        client: createMockCodexClient({
          outputText:
            '{"summary":"Racing tiene edge corto por descanso y bajas rivales.","risks":["Separación pequeña entre señales."]}',
          usage: {
            inputTokens: 88,
            outputTokens: 27,
            totalTokens: 115,
          },
        }),
      }),
    },
  });

  assert.equal(result.dossier.summary, "Racing tiene edge corto por descanso y bajas rivales.");
  assert.deepEqual(result.dossier.risks, ["Separación pequeña entre señales."]);
  assert.equal(result.aiRun?.status, "completed");
  assert.equal(result.featureSnapshot.researchTrace?.synthesisMode, "ai-assisted");
  assert.equal(result.persistableFeatureSnapshot.researchTrace?.synthesisMode, "ai-assisted");
  assert.equal(result.persistableResearchBundle.trace?.aiProvider, "codex");
  assert.equal(result.persistableResearchBundle.trace?.aiRunId, result.aiRun?.id);
  assert.equal(result.fixture.metadata.researchSynthesisMode, undefined);
  assert.equal(result.fixture.metadata.researchAiProvider, undefined);
  assert.equal(result.fixture.metadata.researchAiRunId, undefined);
  assert.equal(persistence.savedFixtures.length, 1);
});

test("runResearchTask falls back deterministically when structured output is invalid and persists failed AiRun", async () => {
  const persistence = createPersistence();
  const result = await runResearchTask({
    fixture,
    generatedAt: "2026-04-18T13:00:00.000Z",
    persistence,
    ai: {
      enabled: true,
      requestedModel: "gpt-5.4-mini",
      codexAdapter: createCodexHttpProvider({
        client: createMockCodexClient({
          outputText: "esto no es json válido",
        }),
      }),
    },
  });

  assert.equal(result.aiRun?.status, "failed");
  assert.equal(result.aiRun?.model, "gpt-5.4-mini");
  assert.match(result.aiRun?.error ?? "", /json/i);
  assert.equal(result.featureSnapshot.researchTrace?.synthesisMode, "ai-fallback");
  assert.match(result.persistableFeatureSnapshot.researchTrace?.fallbackSummary ?? "", /json/i);
  assert.equal(result.fixture.metadata.researchFallbackSummary, undefined);
  assert.ok(result.dossier.summary.includes("lean"));
  assert.ok(result.dossier.risks.some((risk) => risk.includes("fallback")));
});
