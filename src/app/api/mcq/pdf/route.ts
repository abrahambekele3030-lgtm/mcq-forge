/**
 * mcq-forge API — PDF upload + job creation
 * POST /api/mcq/pdf  (multipart/form-data: file, grade, subject, unitNumber, totalRounds)
 * Returns the created job.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { enqueueJob } from '@/lib/mcq-forge/pipeline/runner'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const grade = String(form.get('grade') ?? '').trim()
    const subject = String(form.get('subject') ?? '').trim()
    const unitNumber = parseInt(String(form.get('unitNumber') ?? '1'), 10)
    const totalRounds = parseInt(String(form.get('totalRounds') ?? '6'), 10)

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing PDF file' }, { status: 400 })
    }
    if (!grade || !subject) {
      return NextResponse.json({ error: 'grade and subject are required' }, { status: 400 })
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    await fs.mkdir(UPLOADS_DIR, { recursive: true })
    const buf = Buffer.from(await file.arrayBuffer())
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const pdfPath = path.join(UPLOADS_DIR, `${Date.now()}-${safeName}`)
    await fs.writeFile(pdfPath, buf)

    const job = await db.job.create({
      data: {
        grade,
        subject,
        unitNumber,
        pdfFilename: file.name,
        pdfPath,
        totalRounds: Math.min(50, Math.max(1, totalRounds)),
        status: 'queued',
      },
    })

    // Start the worker (idempotent) — it will extract PDF + detect structure,
    // then pause for user review.
    enqueueJob(job.id)

    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    console.error('[mcq/pdf] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    )
  }
}
