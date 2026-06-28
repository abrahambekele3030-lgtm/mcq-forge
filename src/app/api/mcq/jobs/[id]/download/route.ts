/**
 * mcq-forge API — Download all round files as a ZIP
 * GET /api/mcq/jobs/[id]/download
 *
 * Bundles all completed round files for a job into a single ZIP in the
 * examprep-studio layout:
 *   data/<Subject>/<Grade_X>/<Unit_Y>/R{n}.json
 *
 * Returns a binary ZIP with Content-Disposition: attachment.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'node:fs'
import * as fflate from 'fflate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const job = await db.job.findUnique({
      where: { id },
      include: { rounds: { orderBy: { round: 'asc' } } },
    })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const safeSubject = sanitize(job.subject)
    const safeGrade = sanitize(job.grade).replace(/\s+/g, '_')
    const safeUnit = `Unit_${job.unitNumber}`

    const virtual: Record<string, Uint8Array> = {}

    for (const artifact of job.rounds) {
      try {
        const txt = await fs.readFile(artifact.filePath, 'utf8')
        const zipPath = `data/${safeSubject}/${safeGrade}/${safeUnit}/R${artifact.round}.json`
        virtual[zipPath] = new TextEncoder().encode(txt)
      } catch {
        // skip unreadable round files
      }
    }

    if (Object.keys(virtual).length === 0) {
      return NextResponse.json({ error: 'No round files available yet' }, { status: 404 })
    }

    const zipped = fflate.zipSync(virtual, { level: 6 })

    const filename = `mcq-${safeSubject}-${safeGrade}-${safeUnit}.zip`

    return new NextResponse(zipped, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[mcq/jobs/download] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Download failed' },
      { status: 500 },
    )
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_')
}
