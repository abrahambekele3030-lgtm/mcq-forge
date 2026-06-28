/**
 * mcq-forge API — List and create jobs
 * GET  /api/mcq/jobs          — list recent jobs
 * POST /api/mcq/jobs          — create a job from an already-uploaded PDF path
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { grade, subject, unitNumber, pdfFilename, pdfPath, totalRounds } = body

    if (!grade || !subject || !pdfFilename || !pdfPath) {
      return NextResponse.json(
        { error: 'grade, subject, pdfFilename, and pdfPath are required' },
        { status: 400 },
      )
    }

    const job = await db.job.create({
      data: {
        grade,
        subject,
        unitNumber: parseInt(String(unitNumber ?? 1), 10),
        pdfFilename,
        pdfPath,
        totalRounds: Math.min(50, Math.max(1, parseInt(String(totalRounds ?? 6), 10))),
        status: 'queued',
      },
    })

    enqueueJob(job.id)
    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    console.error('[mcq/jobs POST] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create job' },
      { status: 500 },
    )
  }
}
