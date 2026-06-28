/**
 * mcq-forge — Structure detection service
 *
 * Calls the LLM with the structure-detection prompt, validates the response
 * against the Zod schema, and retries with error feedback on failure.
 * The result is the immutable source of truth for every round.
 */
import { getProvider } from '../providers'
import { structureSchema, type Structure } from '../spec/schema'
import { buildStructureDetectionMessages } from '../prompts'
import type { ExtractedPdf } from './extract'

export interface DetectStructureResult {
  structure: Structure
  attempts: number
  rawResponses: string[]
}

const MAX_ATTEMPTS = 3

export async function detectStructure(
  pdf: ExtractedPdf,
  meta: { grade: string; subject: string; unitNumber: number },
): Promise<DetectStructureResult> {
  const provider = getProvider()
  // Use first ~12 pages or all pages if shorter, capped at ~16K chars for the preview.
  const previewPages = pdf.pages.slice(0, Math.min(12, pdf.pages.length))
  const previewText = capText(
    previewPages.map((p) => `<<<PAGE ${p.pageNumber}>>>\n${p.text}`).join('\n'),
    16000,
  )

  const { messages, maxTokens } = buildStructureDetectionMessages({
    pdfFilename: pdf.filename,
    pageCount: pdf.pageCount,
    grade: meta.grade,
    subject: meta.subject,
    unitNumber: meta.unitNumber,
    previewText,
  })

  const rawResponses: string[] = []
  let lastErrors: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await provider.chat(messages, { maxTokens, temperature: 0.1 })
    rawResponses.push(result.content)

    const parsed = tryParseJson(result.content)
    if (parsed instanceof Error) {
      lastErrors = [`JSON parse failed: ${parsed.message}`]
      continue
    }

    const validation = structureSchema.safeParse(parsed)
    if (validation.success) {
      return { structure: validation.data, attempts: attempt, rawResponses }
    }

    lastErrors = formatZodErrors(validation.error)
    // Retry: append the error feedback
    messages.push({ role: 'assistant', content: result.content.slice(0, 8000) })
    messages.push({
      role: 'user',
      content: `Your previous response failed validation:\n${lastErrors.map((e) => '- ' + e).join('\n')}\nRegenerate the COMPLETE JSON, fixing every error. Return ONLY JSON.`,
    })
  }

  throw new Error(
    `Structure detection failed after ${MAX_ATTEMPTS} attempts. Last errors:\n${lastErrors.join('\n')}`,
  )
}

function tryParseJson(s: string): unknown | Error {
  try {
    return JSON.parse(s)
  } catch {
    // Try extracting the first balanced JSON object
    const start = s.search(/[{[]/)
    if (start < 0) return new Error('no JSON object found')
    let depth = 0, inStr = false, esc = false
    const open = s[start], close = open === '{' ? '}' : ']'
    for (let i = start; i < s.length; i++) {
      const c = s[i]
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (c === open) depth++
      else if (c === close) { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)) } catch (e) { return e as Error } } }
    }
    return new Error('unbalanced JSON')
  }
}

function formatZodErrors(err: import('zod').ZodError): string[] {
  return err.issues.slice(0, 20).map((i) => {
    const path = i.path.join('.') || '(root)'
    return `${path}: ${i.message}`
  })
}

function capText(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '\n... [truncated for structure detection; full content used per-question]'
}
