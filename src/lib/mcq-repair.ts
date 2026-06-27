// JSON repair pipeline for LLM-generated MCQ JSON
// Handles the #1 corruption cause: LaTeX escape sequences in JSON strings
// (e.g. \(p^2\) should be \\(p^2\\) in JSON)
//
// 4 stages:
// 1. Strict parse — JSON.parse directly
// 2. Escape-fix — char-by-char walk that doubles any backslash before a non-standard escape char
// 3. Tolerant parse — removes trailing commas and JS-style comments
// 4. Partial extraction — regex-finds individual {...} question objects in unrecoverable files

import type { RJsonFile, Question } from './mcq-types'

// ===== Stage 1: Strict parse =====
export function strictParse(input: string): unknown | null {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

// ===== Stage 2: Escape fix =====
// Walk the string character by character. When we find a backslash followed
// by a character that is NOT a valid JSON escape target, double the backslash.
// Valid JSON escapes: \\ \/ \" \n \t \r \b \f \uXXXX
// Everything else (like \( \[ \tau \frac \alpha \) \]) needs \\ prefix.
export function fixJsonEscapes(input: string): string {
  let out = ''
  let i = 0
  const n = input.length
  let inString = false

  while (i < n) {
    const ch = input[i]

    // Track whether we're inside a JSON string
    if (ch === '"' && input[i - 1] !== '\\') {
      inString = !inString
      out += ch
      i++
      continue
    }

    if (ch === '\\' && inString) {
      const next = input[i + 1]
      // Valid JSON escape sequences — leave as-is
      if (next === '"' || next === '\\' || next === '/' || next === 'n' || next === 't' ||
          next === 'r' || next === 'b' || next === 'f' || next === 'u') {
        // For \u, check if it's followed by 4 hex digits
        if (next === 'u') {
          const hex = input.slice(i + 2, i + 6)
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += ch + next + hex
            i += 6
            continue
          }
          // Not a valid \uXXXX — fall through to double the backslash
        } else {
          out += ch + next
          i += 2
          continue
        }
      }
      // Invalid escape — double the backslash
      out += '\\' + ch + (next || '')
      i += 2
      continue
    }

    out += ch
    i++
  }

  return out
}

// ===== Stage 3: Tolerant parse =====
// Remove trailing commas, JS-style comments, and other common LLM mistakes
export function tolerantParse(input: string): unknown | null {
  let cleaned = input
  // Remove single-line comments
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '')
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

// ===== Stage 4: Partial extraction =====
// Last resort: regex-find individual question objects in unrecoverable files.
// Handles TRUNCATED JSON by finding complete {...} question blocks.
export function extractQuestionObjects(input: string): unknown[] {
  const questions: unknown[] = []

  // Strategy A: Find the "questions" array and extract complete question objects from it.
  // Each question object starts with { and has "question_id". We track brace depth
  // to find complete objects even in truncated JSON.
  const questionsArrayMatch = input.match(/"questions"\s*:\s*\[/)
  if (questionsArrayMatch) {
    const startIdx = questionsArrayMatch.index! + questionsArrayMatch[0].length
    let i = startIdx
    const n = input.length
    while (i < n) {
      // Skip whitespace and commas
      while (i < n && /[\s,]/.test(input[i])) i++
      if (i >= n || input[i] === ']') break
      if (input[i] !== '{') break

      // Track brace depth to find the complete question object
      let depth = 0
      let inString = false
      let escape = false
      let objStart = i
      let objEnd = -1
      while (i < n) {
        const ch = input[i]
        if (escape) { escape = false; i++; continue }
        if (ch === '\\' && inString) { escape = true; i++; continue }
        if (ch === '"') { inString = !inString; i++; continue }
        if (!inString) {
          if (ch === '{') depth++
          else if (ch === '}') {
            depth--
            if (depth === 0) { objEnd = i + 1; break }
          }
        }
        i++
      }

      if (objEnd === -1) {
        // Truncated object — try to close it and parse
        const partial = input.slice(objStart, i) + '}'
        const fixed = fixJsonEscapes(partial)
        const parsed = tolerantParse(fixed)
        if (parsed && (parsed.question || parsed.question_id)) {
          questions.push(parsed)
        }
        break
      }

      const block = input.slice(objStart, objEnd)
      if (block.includes('"question"') || block.includes('"question_id"')) {
        const fixed = fixJsonEscapes(block)
        try {
          const obj = JSON.parse(fixed)
          if (obj.question || obj.question_id) questions.push(obj)
        } catch {
          const tolerant = tolerantParse(fixed)
          if (tolerant && (tolerant.question || tolerant.question_id)) questions.push(tolerant)
        }
      }
      i = objEnd
    }
  }

  // Strategy B: Fallback regex match for {...} blocks containing "question_id"
  if (questions.length === 0) {
    const regex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(input)) !== null) {
      const block = match[0]
      if (block.includes('"question"') || block.includes('"question_id"')) {
        const fixed = fixJsonEscapes(block)
        try {
          const obj = JSON.parse(fixed)
          if (obj.question || obj.question_id) questions.push(obj)
        } catch {
          const tolerant = tolerantParse(fixed)
          if (tolerant && (tolerant.question || tolerant.question_id)) questions.push(tolerant)
        }
      }
    }
  }

  return questions
}

// ===== Full repair pipeline =====
export interface RepairResult {
  data: RJsonFile | null
  questions: Question[]
  method: 'strict' | 'escape-fix' | 'tolerant' | 'partial' | 'failed'
  error: string | null
}

export function repairRJson(input: string): RepairResult {
  // Extract JSON from code block if wrapped
  let jsonStr = input.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // Remove any text before the first { and after the last }
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  }

  // Stage 1: Strict
  let parsed = strictParse(jsonStr)
  if (parsed && typeof parsed === 'object' && 'questions' in parsed) {
    return { data: parsed as RJsonFile, questions: (parsed as RJsonFile).questions || [], method: 'strict', error: null }
  }

  // Stage 2: Escape-fix
  const escaped = fixJsonEscapes(jsonStr)
  parsed = strictParse(escaped)
  if (parsed && typeof parsed === 'object' && 'questions' in parsed) {
    return { data: parsed as RJsonFile, questions: (parsed as RJsonFile).questions || [], method: 'escape-fix', error: null }
  }

  // Stage 3: Tolerant
  parsed = tolerantParse(escaped)
  if (parsed && typeof parsed === 'object' && 'questions' in parsed) {
    return { data: parsed as RJsonFile, questions: (parsed as RJsonFile).questions || [], method: 'tolerant', error: null }
  }

  // Stage 4: Partial extraction
  const extracted = extractQuestionObjects(escaped)
  if (extracted.length > 0) {
    return {
      data: null,
      questions: extracted as Question[],
      method: 'partial',
      error: `Recovered ${extracted.length} questions via partial extraction (full JSON unrecoverable)`,
    }
  }

  return { data: null, questions: [], method: 'failed', error: 'All repair stages failed' }
}

// ===== Extract __STATE__ from LLM response =====
export function extractState(text: string): EngineState | null {
  // The state is inside the JSON's __STATE__ field
  const repair = repairRJson(text)
  if (repair.data?.__STATE__) {
    return repair.data.__STATE__
  }
  // Try to find __STATE__ directly
  const stateMatch = text.match(/"__STATE__"\s*:\s*(\{[\s\S]*?\})\s*[,}]/)
  if (stateMatch) {
    try {
      const fixed = fixJsonEscapes(stateMatch[1])
      return JSON.parse(fixed)
    } catch {
      // ignore
    }
  }
  return null
}

// Type import for EngineState
import type { EngineState } from './mcq-types'
