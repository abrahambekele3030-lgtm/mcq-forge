/**
 * mcq-forge — PDF text extraction (CONSTRAINT 0: deep PDF ingestion)
 *
 * Uses the free, open-source `pdftotext` binary (poppler-utils) via child_process.
 * On Render free tier, poppler-utils is available in the default Ubuntu image;
 * the Dockerfile installs it explicitly to be safe.
 *
 * Output: one text blob per page, preserving layout (-layout flag) so that
 * heading detection (section 1.1, 1.2, mini-headings ending in ":") works.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'

const execFileAsync = promisify(execFile)

export interface PdfPage {
  pageNumber: number
  text: string
}

export interface ExtractedPdf {
  filename: string
  pageCount: number
  pages: PdfPage[]
  /** Full text concatenated, with page-break markers. */
  fullText: string
}

/**
 * Extract text from a PDF file on disk.
 * @param filePath absolute path to the PDF
 */
export async function extractPdf(filePath: string): Promise<ExtractedPdf> {
  // 1. Get page count via pdfinfo
  const { stdout: info } = await execFileAsync('pdfinfo', [filePath])
  const pageCount = parsePageCount(info)
  if (!pageCount || pageCount < 1) {
    throw new Error(`Could not determine page count for ${filePath}`)
  }

  // 2. Extract text per page (pdftotext -layout)
  const pages: PdfPage[] = []
  // Extract the whole document at once (faster), then split by form-feed (\f).
  const { stdout: raw } = await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', filePath, '-'], {
    maxBuffer: 64 * 1024 * 1024,
  })
  const chunks = raw.split('\f')
  for (let i = 0; i < chunks.length && i < pageCount; i++) {
    pages.push({ pageNumber: i + 1, text: chunks[i].replace(/\r/g, '') })
  }
  // If pdftotext emitted fewer chunks (rare), pad with empty pages.
  while (pages.length < pageCount) pages.push({ pageNumber: pages.length + 1, text: '' })

  const fullText = pages.map((p) => `<<<PAGE ${p.pageNumber}>>>\n${p.text}`).join('\n')
  return { filename: basename(filePath), pageCount, pages, fullText }
}

/** Read a PDF file already on disk into the {@link ExtractedPdf} shape. */
export async function extractPdfFromBuffer(buf: Buffer, filename: string): Promise<ExtractedPdf> {
  // We need a file path for pdftotext; write to a temp file.
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { writeFile, unlink } = await import('node:fs/promises')
  const tmpPath = join(tmpdir(), `mcqforge-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`)
  await writeFile(tmpPath, buf)
  try {
    const result = await extractPdf(tmpPath)
    result.filename = filename
    return result
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}

function parsePageCount(info: string): number {
  const m = info.match(/^Pages:\s+(\d+)/m)
  return m ? parseInt(m[1], 10) : 0
}

function basename(p: string): string {
  return p.split(/[/\\]/).pop() ?? p
}

// ---------------------------------------------------------------------------
// Content chunking for token-efficient LLM calls
// ---------------------------------------------------------------------------

export interface ContentChunk {
  /** Title of the structural element this chunk belongs to. */
  title: string
  /** Page range covered. */
  pageStart: number
  pageEnd: number
  /** The text content (trimmed, with page markers stripped). */
  text: string
  /** Approximate token count (chars/4 heuristic). */
  approxTokens: number
}

/**
 * Build a content chunk for a given structural element by extracting the text
 * between its page_start and page_end. This is what gets sent to the LLM when
 * generating a question for that element — keeping input tokens small.
 */
export function buildContentChunk(
  pdf: ExtractedPdf,
  pageStart: number | null,
  pageEnd: number | null,
  title: string,
): ContentChunk {
  const start = pageStart ?? 1
  const end = Math.min(pageEnd ?? pdf.pageCount, pdf.pageCount)
  const text = pdf.pages
    .filter((p) => p.pageNumber >= start && p.pageNumber <= end)
    .map((p) => p.text)
    .join('\n')
    .trim()
  return {
    title,
    pageStart: start,
    pageEnd: end,
    text,
    approxTokens: Math.ceil(text.length / 4),
  }
}

/** Read a file on disk as a buffer. */
export async function readFileBuffer(filePath: string): Promise<Buffer> {
  return readFile(filePath)
}
