/**
 * mcq-forge API — Structure review & approval
 * GET /api/mcq/jobs/[id]/structure   — get detected structure
 * PUT /api/mcq/jobs/[id]/structure   — approve (and optionally edit) structure,
 *                                       then start round generation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { structureSchema, type Structure } from '@/lib/mcq-forge/spec/schema'
import { enqueueJob } from '@/lib/mcq-forge/pipeline/runner'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const job = await db.job.findUnique({ where: { id } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (!job.structureJson) {
    return NextResponse.json({ error: 'Structure not yet detected', status: job.status }, { status: 409 })
  }
  const structure = JSON.parse(job.structureJson) as Structure
  return NextResponse.json({ structure, approved: job.structureApproved, status: job.status })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const job = await db.job.findUnique({ where: { id } })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // If the user edited the structure, validate it before saving.
  let structure: Structure | null = null
  if (body.structure) {
    const v = structureSchema.safeParse(body.structure)
    if (!v.success) {
      return NextResponse.json(
        { error: 'Edited structure failed validation', details: v.error.issues.slice(0, 10) },
        { status: 400 },
      )
    }
    structure = v.data
  } else if (job.structureJson) {
    structure = JSON.parse(job.structureJson) as Structure
  }
  if (!structure) {
    return NextResponse.json({ error: 'No structure to approve' }, { status: 400 })
  }

  await db.job.update({
    where: { id },
    data: {
      structureJson: JSON.stringify(structure),
      structureApproved: true,
      status: 'queued',
    },
  })

  // Kick off round generation
  enqueueJob(id)
  return NextResponse.json({ ok: true, status: 'queued' })
}
