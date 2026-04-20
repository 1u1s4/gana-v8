#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { runValidationWorker } from '../apps/validation-worker/dist/src/index.js'

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

const envPath = path.join(process.cwd(), '.env')
const envFile = parseDotEnv(fs.readFileSync(envPath, 'utf8'))
const databaseUrl = envFile.GANA_DATABASE_URL || envFile.DATABASE_URL || process.env.GANA_DATABASE_URL || process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('Missing GANA_DATABASE_URL / DATABASE_URL')
}

const executedAt = process.env.GANA_VALIDATION_EXECUTED_AT || new Date().toISOString()
const result = await runValidationWorker(databaseUrl, { executedAt })
console.log(JSON.stringify({
  mode: 'validation-worker',
  executedAt,
  result,
}, null, 2))
