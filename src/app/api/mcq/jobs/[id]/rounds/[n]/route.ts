/**
 * mcq-forge API — Get a single round file as JSON
 * GET /api/mcq/jobs/[id]/rounds/[n]   — returns R{n}.json
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'node:fs'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> },
) {
  const { id, n } = await params
  const round = parseInt(n, 10)
  if (!Number.isFinite(round) || round < 1) {
    return NextResponse.json({ error: 'Invalid round number' }, { status: 400 })
  }
  const artifact = await db.roundArtifact.findUnique({
    where: { jobId_round: { jobId: id, round } },
  })
  if (!artifact) return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  const txt = await fs.readFile(artifact.filePath, 'utf8')
  
  return new NextResponse(txt, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="R${String(round).padStart(2, '0')}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
