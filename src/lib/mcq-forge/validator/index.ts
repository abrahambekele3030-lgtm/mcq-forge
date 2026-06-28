/**
 * mcq-forge — Question & round validator (single entry point)
 *
 * Two-stage validation:
 *   1. Zod shape check (schema.ts)
 *   2. Cross-field semantic rules (constraints.ts)
 *   3. LaTeX well-formedness (latex.ts) — already invoked inside constraints
 *
 * Returns a structured report that the orchestrator feeds back to the LLM.
 */
import { questionSchema, roundFileSchema, type Question, type RoundFile } from '../spec/schema'
import { validateQuestion, type ConstraintViolation } from '../spec/constraints'
import { checkLatexDeep } from '../spec/latex'

export interface QuestionValidation {
  ok: boolean
  /** Zod shape errors (empty if shape is valid). */
  shapeErrors: string[]
  /** Cross-field constraint violations (empty if all pass). */
  constraintViolations: ConstraintViolation[]
  /** LaTeX well-formedness issues found anywhere in the object. */
  latexIssues: string[]
  /** All errors combined, human-readable. */
  allErrors: string[]
}

export function validateQuestionFull(raw: unknown): QuestionValidation {
  const shapeErrors: string[] = []
  const constraintViolations: ConstraintViolation[] = []
  const latexIssues: string[] = []

  const parsed = questionSchema.safeParse(raw)
  let q: Question | null = null
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '(root)'
      shapeErrors.push(`${path}: ${issue.message}`)
    }
  } else {
    q = parsed.data
    constraintViolations.push(...validateQuestion(q))
    for (const issue of checkLatexDeep(q)) {
      latexIssues.push(`${issue.path}: ${issue.message}`)
    }
  }

  const allErrors = [
    ...shapeErrors.slice(0, 30),
    ...constraintViolations.map((v) => `[${v.constraint}] ${v.path ?? ''}: ${v.message}`),
    ...latexIssues.map((m) => `[C15] ${m}`),
  ]

  return {
    ok: allErrors.length === 0,
    shapeErrors,
    constraintViolations,
    latexIssues,
    allErrors,
  }
}

export interface RoundFileValidation {
  ok: boolean
  errors: string[]
  roundFile?: RoundFile
}

/** Validate a complete round file object (top-level + all 10 questions). */
export function validateRoundFile(raw: unknown): RoundFileValidation {
  const errors: string[] = []
  const parsed = roundFileSchema.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '(root)'
      errors.push(`${path}: ${issue.message}`)
    }
    return { ok: false, errors }
  }
  const round = parsed.data
  for (let i = 0; i < round.questions.length; i++) {
    const v = validateQuestionFull(round.questions[i])
    if (!v.ok) {
      errors.push(`questions[${i}] (${round.questions[i].question_id}):`)
      errors.push(...v.allErrors.map((e) => `  - ${e}`))
    }
  }
  return { ok: errors.length === 0, errors, roundFile: round }
}
