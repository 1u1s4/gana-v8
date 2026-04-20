#!/usr/bin/env node
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { PrismaClient } from '@prisma/client'

const args = new Set(process.argv.slice(2))
const dryRun = !args.has('--apply')

function parseDotEnv(content) {
  const env = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function createOpaqueTaskRunId(taskId, attemptNumber) {
  const digest = createHash('sha256').update(`${taskId}:attempt:${attemptNumber}`).digest('hex')
  return `trn_${digest.slice(0, 16)}`
}

const envPath = path.join(process.cwd(), '.env')
const envFile = parseDotEnv(fs.readFileSync(envPath, 'utf8'))
const databaseUrl = envFile.GANA_DATABASE_URL || envFile.DATABASE_URL || process.env.GANA_DATABASE_URL || process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('Missing GANA_DATABASE_URL / DATABASE_URL')
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
})

function normalize(value) {
  return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v))
}

async function main() {
  const legacyTaskRuns = await prisma.taskRun.findMany({
    where: {
      id: {
        contains: ':attempt:',
      },
    },
    orderBy: [
      { createdAt: 'asc' },
      { taskId: 'asc' },
      { attemptNumber: 'asc' },
    ],
    select: {
      id: true,
      taskId: true,
      attemptNumber: true,
      status: true,
      createdAt: true,
    },
  })

  const mappings = legacyTaskRuns.map((row) => ({
    oldId: row.id,
    newId: createOpaqueTaskRunId(row.taskId, row.attemptNumber),
    taskId: row.taskId,
    attemptNumber: row.attemptNumber,
    status: row.status,
    createdAt: row.createdAt,
  }))

  const duplicateTargets = new Map()
  for (const mapping of mappings) {
    duplicateTargets.set(mapping.newId, (duplicateTargets.get(mapping.newId) ?? 0) + 1)
  }
  const conflictingTargets = [...duplicateTargets.entries()].filter(([, count]) => count > 1)

  const existingTargetRows = mappings.length
    ? await prisma.taskRun.findMany({
        where: {
          id: {
            in: mappings.map((item) => item.newId),
          },
        },
        select: { id: true, taskId: true, attemptNumber: true },
      })
    : []

  const incompatibleExistingTargets = existingTargetRows.filter((row) => {
    const mapping = mappings.find((item) => item.newId === row.id)
    return !mapping || mapping.taskId !== row.taskId || mapping.attemptNumber !== row.attemptNumber
  })

  const auditRefs = await prisma.$queryRawUnsafe(`
    SELECT id, JSON_UNQUOTE(JSON_EXTRACT(payload, '$.taskRunId')) AS taskRunId
    FROM AuditEvent
    WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.taskRunId')) LIKE '%:attempt:%'
       OR JSON_UNQUOTE(JSON_EXTRACT(payload, '$.taskRunId')) LIKE '\\"trn\\_%\\"'
    ORDER BY occurredAt ASC
  `)

  const auditRefRows = normalize(auditRefs)
  const mappingByOldId = new Map(mappings.map((item) => [item.oldId, item]))
  const applicableAuditRefs = auditRefRows
    .map((row) => {
      const rawTaskRunId = typeof row.taskRunId === 'string' ? row.taskRunId : null
      if (!rawTaskRunId) return null
      const normalizedTaskRunId = rawTaskRunId.startsWith('"') && rawTaskRunId.endsWith('"')
        ? rawTaskRunId.slice(1, -1)
        : rawTaskRunId
      if (mappingByOldId.has(normalizedTaskRunId)) {
        return {
          auditEventId: row.id,
          oldTaskRunId: rawTaskRunId,
          newTaskRunId: mappingByOldId.get(normalizedTaskRunId).newId,
        }
      }
      if (/^trn_[a-f0-9]{16}$/.test(normalizedTaskRunId)) {
        return {
          auditEventId: row.id,
          oldTaskRunId: rawTaskRunId,
          newTaskRunId: normalizedTaskRunId,
        }
      }
      return null
    })
    .filter(Boolean)

  const summary = {
    mode: dryRun ? 'dry-run' : 'apply',
    legacyTaskRunCount: mappings.length,
    auditEventTaskRunRefCount: applicableAuditRefs.length,
    duplicateTargetCount: conflictingTargets.length,
    incompatibleExistingTargetCount: incompatibleExistingTargets.length,
    sampleMappings: mappings.slice(0, 10),
    sampleAuditRefs: applicableAuditRefs.slice(0, 10),
  }

  if (conflictingTargets.length > 0 || incompatibleExistingTargets.length > 0) {
    console.log(JSON.stringify({
      ...summary,
      conflictingTargets,
      incompatibleExistingTargets,
      aborted: true,
    }, null, 2))
    process.exitCode = 1
    return
  }

  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  await prisma.$transaction(async (tx) => {
    for (const mapping of mappings) {
      if (mapping.oldId === mapping.newId) continue
      await tx.$executeRawUnsafe(
        'UPDATE TaskRun SET id = ? WHERE id = ?',
        mapping.newId,
        mapping.oldId,
      )
    }

    for (const ref of applicableAuditRefs) {
      await tx.$executeRawUnsafe(
        `UPDATE AuditEvent
         SET payload = JSON_SET(payload, '$.taskRunId', ?)
         WHERE id = ?`,
        ref.newTaskRunId,
        ref.auditEventId,
      )
    }
  }, {
    maxWait: 10000,
    timeout: 120000,
  })

  const remainingLegacyTaskRuns = normalize(await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS count
    FROM TaskRun
    WHERE id LIKE '%:attempt:%'
  `))
  const remainingLegacyAuditRefs = normalize(await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS count
    FROM AuditEvent
    WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.taskRunId')) LIKE '%:attempt:%'
       OR JSON_UNQUOTE(JSON_EXTRACT(payload, '$.taskRunId')) LIKE '\\"trn\\_%\\"'
  `))

  console.log(JSON.stringify({
    ...summary,
    applied: true,
    remainingLegacyTaskRuns,
    remainingLegacyAuditRefs,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
