import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { repairRJson, extractState } from '@/lib/mcq-repair'
import type { EngineState } from '@/lib/mcq-types'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// ===== In-memory job store (works for a single dev server instance) =====
interface Job {
  id: string
  status: 'pending' | 'running' | 'done' | 'error'
  result: any
  error: string | null
  startedAt: number
  completedAt: number | null
  progress: string
}

const jobs = new Map<string, Job>()

// ===== Load the spec once and cache it =====
let specCache: string | null = null
async function loadSpec(): Promise<string> {
  if (specCache) return specCache
  try {
    specCache = await readFile(join(process.cwd(), 'public', 'mcq_engine_spec_v9.txt'), 'utf-8')
  } catch {
    specCache = await readFile(join(process.cwd(), 'upload', 'mcq_engine_spec_v9.txt'), 'utf-8')
  }
  return specCache!
}

// ===== Instruction wrapper =====
const ENGINE_OVERRIDE_INSTRUCTION = `
CRITICAL JSON ESCAPE RULE (READ CAREFULLY):
You are outputting JSON. In JSON string values, the backslash character \\ is special.
ALL LaTeX backslashes in your output MUST be DOUBLE-ESCAPED.

WRONG (causes JSON parse error):
  "question": "What is \\( \\frac{a}{b} \\)?"
  "formula_used": ["\\tau = mgd"]

CORRECT (valid JSON):
  "question": "What is \\\\( \\\\frac{a}{b} \\\\)?"
  "formula_used": ["\\\\tau = mgd"]

Rule: Every single \\ in your LaTeX must become \\\\ in the JSON string.
- \\( → \\\\(
- \\) → \\\\)
- \\[ → \\\\[
- \\] → \\\\]
- \\frac → \\\\frac
- \\tau → \\\\tau
- \\alpha → \\\\alpha
- \\sqrt → \\\\sqrt
- \\times → \\\\times
- \\cdot → \\\\cdot
- etc.

This is NOT optional. If you output single backslashes before LaTeX commands,
the JSON will be invalid and your entire batch will be lost.


CRITICAL OUTPUT SIZE OVERRIDE (OVERRIDES CONSTRAINT 23):
CONSTRAINT 23 says "Exactly 10 questions per batch" — this is OVERRIDDEN.
You MUST generate EXACTLY 3 questions per batch (not 10).
This is because the full JSON schema is too large for a single response.
3 questions with complete metadata is better than 10 questions with truncated JSON.

COMPACT OUTPUT RULES (MANDATORY — to fit within output token limits):
- Keep "explanation" to exactly 2 sentences, 30-40 words max.
- Keep "hint" to 10-15 words.
- For "explanations_tiered":
  - "definition": 1 sentence max.
  - "concept_summary": 1-2 sentences max.
  - "beginner", "intermediate", "advanced": 2 sentences each max.
  - "worked_solution": max 3 steps, each 1 sentence.
  - "reasoning_steps": max 3 steps, each 1 sentence.
  - "formula_analysis": include only if formulas are used; max 1 entry.
  - "misconceptions": max 2 items, each 1 sentence.
  - "related_concepts": max 3 items.
  - "revision_note": 1 sentence.
  - "glossary_entry": include only if directly relevant.
  - "flashcard": include front (1 sentence) and back (1 sentence).
  - "concept_map_nodes": output [] if not needed.
- For "visual_system": if no visual is needed, output ALL fields as null with requires_visual: false.
- For "layout_metadata": output {} (empty object).
- For "publishing_metadata": include only "target_documents" (["R01"]), "bloom_level", and "glossary_term"/"glossary_definition" if relevant. Omit all null fields.
- For "numeric": if not numeric, output: {"is_numeric": false, "given_values": null, "answer_value": null, "answer_unit": null, "calculation_steps": null, "significant_figures": null}
- For "validation": keep minimal.
- For "quality_metrics": include the 4 required fields with integer values.
- For "source_trace": include the 6 required fields, keep content_anchor to 1 sentence.
- For "batch_metrics": output null.
- For "system_checks": output null.
- For "validation_report": keep minimal — batch_validation with questions_validated, batch_status, validation_timestamp only.

OUTPUT FORMAT:
- Output a SINGLE JSON code block.
- Do NOT output any text before or after the code block.
- Ensure the JSON is COMPLETE and properly closed with matching braces.
`

// ===== Request types =====
interface GenerateRequest {
  action: 'start' | 'verify' | 'next' | 'restore_and_next'
  pdfText?: string
  pdfFilename?: string
  grade?: string
  subject?: string
  unit?: string
  state?: EngineState | null
  structure?: string
  conversationHistory?: Array<{ role: string; content: string }>
}

// ===== Build messages for each action =====
function buildMessages(action: string, body: GenerateRequest, systemPrompt: string): Array<{ role: string; content: string }> {
  if (action === 'start') {
    return [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: `PDF FILENAME: ${body.pdfFilename || 'unit.pdf'}
GRADE: ${body.grade}
SUBJECT: ${body.subject}
UNIT: ${body.unit}

PDF CONTENT (extracted text):
---
${body.pdfText}
---

COMMAND: start

Follow the USER WORKFLOW STEP 0 and STEP 1 exactly. Ingest the PDF, detect the structure, output the structure in the format specified by CONSTRAINT 1.5, and ask "STRUCTURE DETECTED. VERIFY CORRECT? (yes/no)"` },
    ]
  }
  if (action === 'verify') {
    return [...(body.conversationHistory || []), { role: 'user', content: 'yes' }]
  }
  if (action === 'next' || action === 'restore_and_next') {
    const state = body.state!
    const structure = body.structure!
    const roundNum = state.current_round || 1
    const roundId = `R${String(roundNum).padStart(2, '0')}`
    return [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: `You are continuing MCQ generation for a textbook unit.

VERIFIED STRUCTURE (from previous step):
${structure}

CURRENT __STATE__ (carry this forward, update after generation):
${JSON.stringify(state, null, 2)}

GRADE: ${body.grade || ''}
SUBJECT: ${body.subject || ''}
UNIT: ${body.unit || ''}
PDF FILENAME: ${body.pdfFilename || 'unit.pdf'}

COMMAND: next
Generate batch ${roundNum} (round ${roundId}).

REQUIREMENTS:
- Generate EXACTLY 3 questions (NOT 10 — batch size override for output limits).
- Follow ALL constraints from the system prompt.
- Use the __STATE__ above to continue from where the last batch left off.
- Update __STATE__ with new covered_sections, used_question_signatures, baseline_counter, etc.
- Set round_id to "${roundId}" and batch_sequence to ${roundNum}.
- Output a SINGLE complete JSON code block with the full schema.
- Ensure all JSON braces are properly closed.
- Keep ALL fields compact per the COMPACT OUTPUT RULES.
- If you cannot generate any new valid questions (true exhaustion), output a JSON with "exhaustion_reached": true and an empty questions array.` },
    ]
  }
  return []
}

// ===== Background LLM call =====
async function runLLMJob(jobId: string, messages: Array<{ role: string; content: string }>, action: string, body: GenerateRequest) {
  const job = jobs.get(jobId)!
  try {
    job.status = 'running'
    job.progress = 'Calling LLM…'

    let fullResponse = ''
    let lastError: Error | null = null
    let attempt = 0
    const maxRetries = 2

    while (attempt <= maxRetries) {
      try {
        job.progress = `LLM call attempt ${attempt + 1}…`

        // Use direct fetch to the Zhipu/BigModel API — more reliable than the SDK
        // which may use an internal endpoint that doesn't work externally
        const apiKey = process.env.ZAI_API_KEY
        const baseUrl = process.env.ZAI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'

        if (!apiKey) {
          throw new Error('ZAI_API_KEY environment variable is not set')
        }

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'glm-4.6',
            messages: messages as any,
            max_tokens: 8192,
            thinking: { type: 'disabled' },
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          console.error(`LLM API error ${response.status}:`, errText.slice(0, 500))
          throw new Error(`LLM API returned ${response.status}: ${errText.slice(0, 200)}`)
        }

        const completion = await response.json()

        // Robust response parsing — handle various API response shapes
        const content = completion?.choices?.[0]?.message?.content
          || completion?.choices?.[0]?.delta?.content
          || completion?.output?.choices?.[0]?.message?.content
          || completion?.output?.text
          || completion?.content
          || (typeof completion === 'string' ? completion : null)

        if (!content || (typeof content === 'string' && content.trim().length === 0)) {
          console.error('Unexpected LLM response shape:', JSON.stringify(completion).slice(0, 500))
          throw new Error('Empty or unparseable response from LLM')
        }
        fullResponse = content
        break
      } catch (err) {
        lastError = err as Error
        console.error(`LLM attempt ${attempt + 1} failed:`, (err as Error).message)
        attempt++
        if (attempt <= maxRetries) await new Promise((r) => setTimeout(r, 2000 * attempt))
      }
    }

    if (!fullResponse) throw lastError || new Error('LLM call failed')

    job.progress = 'Processing response…'

    // Build result metadata
    let result: Record<string, unknown> = { action, response: fullResponse }

    if (action === 'next' || action === 'restore_and_next') {
      const repair = repairRJson(fullResponse)
      const newState = extractState(fullResponse) || body.state || null
      result = {
        action,
        response: fullResponse,
        repaired: repair.data,
        questions: repair.questions,
        repairMethod: repair.method,
        repairError: repair.error,
        state: newState,
        isExhaustion: fullResponse.includes('EXHAUSTION REACHED') || repair.data?.exhaustion_reached === true,
        isSafetyLimit: fullResponse.includes('SAFETY LIMIT REACHED') || repair.data?.safety_limit_triggered === true,
      }
    } else if (action === 'start' || action === 'verify') {
      const updatedConv = [...messages, { role: 'assistant', content: fullResponse }]
      result = { action, response: fullResponse, conversationHistory: updatedConv }
    }

    job.result = result
    job.status = 'done'
    job.completedAt = Date.now()
  } catch (err) {
    job.status = 'error'
    job.error = (err as Error).message
    job.completedAt = Date.now()
  }
}

// ===== Main handler: POST creates a job, GET polls status =====
export async function POST(req: NextRequest) {
  try {
    const body: GenerateRequest = await req.json()

    // Check for polling requests: ?poll=jobId
    const pollId = new URL(req.url).searchParams.get('poll')
    if (pollId) {
      const job = jobs.get(pollId)
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      // Clean up old jobs (keep last 20)
      if (jobs.size > 20) {
        const oldJobs = Array.from(jobs.entries())
          .sort((a, b) => a[1].startedAt - b[1].startedAt)
          .slice(0, jobs.size - 20)
        for (const [id] of oldJobs) {
          if (id !== pollId) jobs.delete(id)
        }
      }
      return NextResponse.json({
        id: job.id,
        status: job.status,
        progress: job.progress,
        result: job.result,
        error: job.error,
      })
    }

    // Create a new job
    const spec = await loadSpec()
    const systemPrompt = spec + ENGINE_OVERRIDE_INSTRUCTION
    const messages = buildMessages(body.action, body, systemPrompt)

    if (messages.length === 0) {
      return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 })
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const job: Job = {
      id: jobId,
      status: 'pending',
      result: null,
      error: null,
      startedAt: Date.now(),
      completedAt: null,
      progress: 'Starting…',
    }
    jobs.set(jobId, job)

    // Start the LLM call in the background (don't await)
    runLLMJob(jobId, messages, body.action, body).catch((err) => {
      console.error(`Job ${jobId} crashed:`, err)
      job.status = 'error'
      job.error = err.message
      job.completedAt = Date.now()
    })

    // Return the job ID immediately — client will poll for status
    return NextResponse.json({ jobId, status: 'pending' })
  } catch (error) {
    console.error('Generate API error:', error)
    return NextResponse.json(
      { error: `Generation failed: ${(error as Error).message}` },
      { status: 500 },
    )
  }
}

// ===== GET handler for polling =====
export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 })
  }
  const job = jobs.get(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
  })
}
