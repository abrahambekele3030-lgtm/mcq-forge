/**
 * mcq-forge API — List and create jobs
 * GET  /api/mcq/jobs          — list recent jobs
 * POST /api/mcq/jobs          — create a job from an already-uploaded PDF
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { enqueueJob } from '@/lib/mcq-forge/pipeline/runner'

export const runtime = 'nodejs'

export async function GET() {
  const jobs = await db.job.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { rounds: true } } },
  })
  return NextResponse.json({ jobs })
}
