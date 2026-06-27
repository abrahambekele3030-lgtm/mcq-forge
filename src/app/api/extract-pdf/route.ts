import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { tmpdir } from 'os'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('pdf') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    // Save to temp file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const tmpFile = join(tmpdir(), `mcq_${Date.now()}.pdf`)
    await writeFile(tmpFile, buffer)

    try {
      // Extract text using pdftotext (available on the system)
      const outFile = tmpFile.replace('.pdf', '.txt')
      try {
        execSync(`pdftotext -layout "${tmpFile}" "${outFile}"`, { timeout: 30000 })
      } catch {
        // Fallback: try without -layout
        execSync(`pdftotext "${tmpFile}" "${outFile}"`, { timeout: 30000 })
      }

      const text = await readFile(outFile, 'utf-8')
      // Cleanup
      await unlink(tmpFile).catch(() => {})
      await unlink(outFile).catch(() => {})

      if (!text || text.trim().length < 100) {
        return NextResponse.json({ error: 'PDF text extraction failed or produced too little text' }, { status: 422 })
      }

      return NextResponse.json({
        text,
        filename: file.name,
        size: file.size,
        textLength: text.length,
        pages: text.split('\f').length, // pdftotext separates pages with \f
      })
    } catch (extractError) {
      await unlink(tmpFile).catch(() => {})
      throw extractError
    }
  } catch (error) {
    console.error('PDF extraction error:', error)
    return NextResponse.json(
      { error: `PDF extraction failed: ${(error as Error).message}` },
      { status: 500 },
    )
  }
}
