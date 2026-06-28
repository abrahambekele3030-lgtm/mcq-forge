/**
 * mcq-forge — In-process job runner
 *
 * A singleton worker that drains the job queue one job at a time. On Render
 * free tier this runs inside the Next.js process (no separate worker dyno).
 * Jobs are resumable: if the process restarts, the runner picks up any job
 * with status "generating" and resumes from the last committed round.
 */
import { db } from '@/lib/db'
import { extractPdf } from '../pdf/extract'
import { detectStructure } from '../pdf/structure-detect'
import { runOrchestrator, type ProgressEvent, type OrchestratorJob } from './orchestrator'
import type { Structure, Question, RoundFile } from '../spec/schema'
import { writeRoundFile, readRoundFile, listRoundFiles, ensureJobDir } from './storage'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')
const OUTPUTS_DIR = path.join(process.cwd(), 'outputs')

let workerPromise: Promise<void> | null = null
const cancellationFlags = new Set<string>() // jobIds that should stop

/** Enqueue a job: mark it queued so the worker picks it up. */
export async function enqueueJob(jobId: string): Promise<void> {
  await db.job.update({ where: { id: jobId }, data: { status: 'queued' } })
  ensureWorkerRunning()
}

/** Request cancellation of a running job. */
export function cancelJob(jobId: string): void {
  cancellationFlags.add(jobId)
}

/** Start the worker loop if not already running. Idempotent. */
export function ensureWorkerRunning(): Promise<void> {
  if (!workerPromise) {
    workerPromise = runWorkerLoop().catch((err) => {
      console.error('[mcq-forge] worker loop crashed:', err)
      workerPromise = null
    })
  }
  return workerPromise
}

async function runWorkerLoop(): Promise<void> {
  // Ensure output dirs exist
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.mkdir(OUTPUTS_DIR, { recursive: true })

  // The worker loop MUST NEVER crash the app. If the database is unreachable
  // (e.g. tables don't exist yet, connection blip, Render Postgres still
  // booting), we log the error and retry with backoff. This keeps the HTTP
  // server healthy while the DB recovers.
  let consecutiveErrors = 0
  for (;;) {
    try {
      const job = await db.job.findFirst({
        // NOTE: 'awaiting_structure_review' is intentionally excluded — it is a
        // user-action state, not a worker state. Including it causes the worker
        // to spin forever on that job and starve all others.
        where: { status: { in: ['queued', 'generating', 'detecting_structure', 'extracting'] } },
        orderBy: { createdAt: 'asc' },
      })
      consecutiveErrors = 0 // reset on successful DB contact

      if (!job) {
        await sleep(2000)
        continue
      }

      try {
        console.log(`[mcq-forge] worker picked up job ${job.id} (status=${job.status})`)
        await processJob(job.id)
        console.log(`[mcq-forge] worker finished job ${job.id}`)
      } catch (err) {
        console.error(`[mcq-forge] job ${job.id} failed:`, err)
        await db.job.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        }).catch(() => {})
      }
    } catch (err) {
      // DB-level error (table missing, connection refused, etc.)
      consecutiveErrors++
      const delay = Math.min(30000, 2000 * consecutiveErrors)
      console.error(
        `[mcq-forge] worker DB error (attempt ${consecutiveErrors}), retrying in ${delay}ms:`,
        err instanceof Error ? err.message : String(err),
      )
      if (consecutiveErrors === 1) {
        console.error(
          '[mcq-forge] If this is "table does not exist", the schema will be auto-pushed ' +
          'on next boot, or run `bun run db:setup` manually.'
        )
      }
      await sleep(delay)
    }
  }
}

async function processJob(jobId: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId }, include: { rounds: true } })
  if (!job) {
    console.log(`[mcq-forge] processJob: job ${jobId} not found`)
    return
  }

  // If awaiting structure review, do nothing — the user must approve via API.
  if (job.status === 'awaiting_structure_review') {
    console.log(`[mcq-forge] processJob: job ${jobId} awaiting review, skipping`)
    return
  }

  // 1. Extract PDF (cached: skip if structure already detected)
  let structure: Structure | null = job.structureJson ? JSON.parse(job.structureJson) as Structure : null
  if (!structure) {
    await db.job.update({ where: { id: jobId }, data: { status: 'extracting' } })
    const pdf = await extractPdf(job.pdfPath)

    await db.job.update({ where: { id: jobId }, data: { status: 'detecting_structure' } })
    const result = await detectStructure(pdf, {
      grade: job.grade, subject: job.subject, unitNumber: job.unitNumber,
    })
    structure = result.structure
    await db.job.update({
      where: { id: jobId },
      data: { structureJson: JSON.stringify(structure) },
    })

    // Pause for user review
    await db.job.update({
      where: { id: jobId },
      data: { status: 'awaiting_structure_review' },
    })
    return
  }

  // 2. Structure approved — generate rounds
  if (job.status === 'queued' || job.status === 'generating') {
    await generateRounds(jobId, structure)
  }
}

async function generateRounds(jobId: string, structure: Structure): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId }, include: { rounds: true } })
  if (!job) return

  const pdf = await extractPdf(job.pdfPath)
  const priorQuestions = await loadPriorQuestions(jobId)
  const startRound = Math.max(job.startRound, (job.currentRound ?? 0) + 1)

  const idPrefix = buildIdPrefix(job.grade, job.subject, job.unitNumber)

  const orchestratorJob: OrchestratorJob = {
    jobId,
    pdf,
    structure,
    grade: job.grade,
    subject: job.subject,
    unitNumber: job.unitNumber,
    idPrefix,
    pdfFilename: job.pdfFilename,
    startRound,
    priorQuestions,
    previousHash: job.previousHash,
    maxRounds: job.totalRounds > 0 ? job.totalRounds : 10,
    shouldStop: () => cancellationFlags.has(jobId),
    onProgress: async (event: ProgressEvent) => {
      await recordEvent(jobId, event).catch(() => {})
    },
  }

  await db.job.update({ where: { id: jobId }, data: { status: 'generating' } })

  const result = await runOrchestrator(orchestratorJob)
  cancellationFlags.delete(jobId)

  // Write round files + update DB
  for (const round of result.rounds) {
    const roundNum = parseInt(round.round_id.slice(1), 10)
    const filePath = await writeRoundFile(jobId, round, roundNum)
    const stat = await fs.stat(filePath)
    await db.roundArtifact.upsert({
      where: { jobId_round: { jobId, round: roundNum } },
      create: {
        jobId, round: roundNum, roundId: round.round_id,
        filePath, questionCount: round.questions.length, jsonSize: stat.size,
      },
      update: { filePath, questionCount: round.questions.length, jsonSize: stat.size },
    })
  }

  const lastRound = result.rounds[result.rounds.length - 1]
  await db.job.update({
    where: { id: jobId },
    data: {
      status: result.stopped ? 'cancelled' : result.safetyLimit ? 'completed' : result.exhausted ? 'completed' : 'completed',
      currentRound: result.rounds.length ? parseInt(result.rounds[result.rounds.length - 1].round_id.slice(1), 10) : job.currentRound,
      totalQuestions: result.allQuestions.length,
      stateJson: lastRound ? JSON.stringify(lastRound.__STATE__) : job.stateJson,
      previousHash: lastRound?.__STATE__.validation_hash ?? job.previousHash,
      exhausted: result.exhausted,
      userStopped: result.stopped,
      safetyLimit: result.safetyLimit,
      progress: 1,
    },
  })
}

async function loadPriorQuestions(jobId: string): Promise<Question[]> {
  const artifacts = await db.roundArtifact.findMany({ where: { jobId }, orderBy: { round: 'asc' } })
  const out: Question[] = []
  for (const a of artifacts) {
    const rf = await readRoundFile(a.filePath)
    if (rf) out.push(...rf.questions)
  }
  return out
}

async function recordEvent(jobId: string, event: ProgressEvent): Promise<void> {
  // Persist lightweight events for the UI to poll; also update progress.
  const ts = new Date().toISOString()
  let progress = 0
  let payload: Record<string, unknown> = { type: event.type, ts }
  switch (event.type) {
    case 'round_start':
      progress = (event.round - 1) / 50
      payload = { ...payload, round: event.round }
      break
    case 'question_ok':
      progress = (event.round - 1) / 50 + (event.index + 1) / 10 / 50
      payload = { ...payload, round: event.round, index: event.index, questionId: event.questionId, latencyMs: event.latencyMs, tokens: event.tokens }
      break
    case 'round_complete':
      progress = event.round / 50
      payload = { ...payload, round: event.round, latencyMs: event.latencyMs, questions: event.roundFile.questions.length }
      break
    case 'complete':
      progress = 1
      payload = { ...payload, totalRounds: event.totalRounds, totalQuestions: event.totalQuestions }
      break
    case 'question_fail':
    case 'round_fail':
      payload = { ...payload, error: (event as { error: string }).error }
      break
  }
  await db.jobEvent.create({
    data: { jobId, type: event.type, payload: JSON.stringify(payload) },
  }).catch(() => {})
  if (progress > 0) {
    await db.job.update({ where: { id: jobId }, data: { progress: Math.min(1, progress) } }).catch(() => {})
  }
}

function buildIdPrefix(grade: string, subject: string, unitNumber: number): string {
  const g = grade.replace(/[^0-9]/g, '').padStart(2, '0').slice(-2) || '00'
  const s = subjectAbbrev(subject)
  const u = `U${unitNumber}`
  return `G${g}_${s}_${u}`
}

function subjectAbbrev(subject: string): string {
  const map: Record<string, string> = {
    mathematics: 'Math', math: 'Math',
    physics: 'Phys', chemistry: 'Chem', biology: 'Bio',
  }
  return map[subject.toLowerCase()] ?? subject.slice(0, 4)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export { OUTPUTS_DIR, UPLOADS_DIR }
// also re-export listRoundFiles for API use
export { listRoundFiles } from './storage'
