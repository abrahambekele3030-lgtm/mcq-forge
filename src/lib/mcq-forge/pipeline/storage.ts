/**
 * mcq-forge — On-disk storage for round files
 *
 * Writes R{n}.json files in the exact layout consumed by examprep-studio:
 *   outputs/<jobId>/Subject/Grade_X/Unit_Y/R{n}.json
 * Every file is written with JSON.stringify(obj, null, 2) and is guaranteed
 * to be valid JSON (validated by the orchestrator before write).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { RoundFile } from '../spec/schema'

const OUTPUTS_DIR = path.join(process.cwd(), 'outputs')

export function ensureJobDir(jobId: string): string {
  const dir = path.join(OUTPUTS_DIR, jobId)
  return dir
}

export function jobDir(jobId: string): string {
  return path.join(OUTPUTS_DIR, jobId)
}

/**
 * Build the output path for a round file in the examprep-studio layout.
 * e.g. outputs/<jobId>/Mathematics/Grade_9/Unit_1/R1.json
 */
export function roundFilePath(
  jobId: string,
  subject: string,
  grade: string,
  unitNumber: number,
  round: number,
): string {
  const safeSubject = sanitize(subject)
  const safeGrade = sanitize(grade).replace(/\s+/g, '_')
  const safeUnit = `Unit_${unitNumber}`
  const fileName = `R${round}.json`
  return path.join(OUTPUTS_DIR, jobId, safeSubject, safeGrade, safeUnit, fileName)
}

export async function writeRoundFile(
  jobId: string,
  round: RoundFile,
  roundNum: number,
): Promise<string> {
  const filePath = roundFilePath(
    jobId,
    round.subject,
    round.grade,
    parseInt(round.unit.match(/\d+/)?.[0] ?? '1', 10) || 1,
    roundNum,
  )
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const json = JSON.stringify(round, null, 2)
  await fs.writeFile(filePath, json, 'utf8')
  return filePath
}

export async function readRoundFile(filePath: string): Promise<RoundFile | null> {
  try {
    const txt = await fs.readFile(filePath, 'utf8')
    return JSON.parse(txt) as RoundFile
  } catch {
    return null
  }
}

export async function listRoundFiles(jobId: string): Promise<{ round: number; path: string }[]> {
  const dir = jobDir(jobId)
  const out: { round: number; path: string }[] = []
  async function walk(d: string) {
    let entries: import('node:fs').Dirent[]
    try { entries = await fs.readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile() && /^R\d+\.json$/.test(e.name)) {
        const n = parseInt(e.name.slice(1, -5), 10)
        out.push({ round: n, path: full })
      }
    }
  }
  await walk(dir)
  return out.sort((a, b) => a.round - b.round)
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_')
}
