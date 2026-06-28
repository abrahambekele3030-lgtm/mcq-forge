/**
 * mcq-forge API — Job detail
 * GET    /api/mcq/jobs/[id]   — full job status + recent events
 * DELETE /api/mcq/jobs/[id]   — cancel a running job
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cancelJob } from '@/lib/mcq-forge/pipeline/runner'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const job = await db.job.findUnique({
    where: { id },
    include: {
      rounds: { orderBy: { round: 'asc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ job })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  cancelJob(id)
  await db.job.update({
    where: { id },
    data: { status: 'cancelled', userStopped: true },
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}
