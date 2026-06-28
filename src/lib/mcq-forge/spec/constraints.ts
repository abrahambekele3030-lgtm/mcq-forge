/**
 * mcq-forge — Cross-field constraint validators
 *
 * Zod handles shape and enums; this module handles the semantic rules that
 * span multiple fields (word-count bounds by MCQ type, numeric/type-E
 * consistency, visual-system nullness rules, etc.). Each function returns a
 * list of {@link ConstraintViolation}s keyed by the constraint ID from the spec.
 */
import type { Question } from './schema'
import { MCQ_TYPE_LABELS, STEM_WORD_BOUNDS, WORD_BOUNDS, wordCount } from './enums'
import { detectTextbookReferences } from './textbook-filter'
import { checkLatexString } from './latex'

export interface ConstraintViolation {
  /** Constraint ID, e.g. "C11", "C14", "C31". */
  constraint: string
  /** Human-readable explanation. */
  message: string
  /** Path within the question object, e.g. "explanation", "options.A". */
  path?: string
}

/** Validate a single question against all applicable constraints. */
export function validateQuestion(q: Question): ConstraintViolation[] {
  const v: ConstraintViolation[] = []

  // C11 — stem length by type
  const [stemMin, stemMax] = STEM_WORD_BOUNDS[q.mcq_type]
  const stemWords = wordCount(q.question)
  if (stemWords < stemMin || stemWords > stemMax) {
    v.push({
      constraint: 'C11',
      path: 'question',
      message: `Type ${q.mcq_type} (${MCQ_TYPE_LABELS[q.mcq_type]}) stem must be ${stemMin}-${stemMax} words; got ${stemWords}.`,
    })
  }

  // C11 — options 5-12 words, grammatically parallel (we check length only)
  for (const letter of ['A', 'B', 'C', 'D'] as const) {
    const ow = wordCount(q.options[letter])
    const [omin, omax] = WORD_BOUNDS.option
    if (ow < omin || ow > omax) {
      v.push({
        constraint: 'C11',
        path: `options.${letter}`,
        message: `Option ${letter} must be ${omin}-${omax} words; got ${ow}.`,
      })
    }
  }

  // C11 — hint 10-15 words
  const hintWords = wordCount(q.hint)
  const [hintMin, hintMax] = WORD_BOUNDS.hint
  if (hintWords < hintMin || hintWords > hintMax) {
    v.push({
      constraint: 'C11',
      path: 'hint',
      message: `Hint must be ${hintMin}-${hintMax} words; got ${hintWords}.`,
    })
  }

  // C22A — explanation 30-40 words, exactly 2 sentences
  const expWords = wordCount(q.explanation)
  const [expMin, expMax] = WORD_BOUNDS.explanation
  if (expWords < expMin || expWords > expMax) {
    v.push({
      constraint: 'C22A',
      path: 'explanation',
      message: `Explanation must be ${expMin}-${expMax} words; got ${expWords}.`,
    })
  }
  const sentences = q.explanation.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  if (sentences.length !== 2) {
    v.push({
      constraint: 'C22A',
      path: 'explanation',
      message: `Explanation must be exactly 2 sentences; got ${sentences.length}.`,
    })
  }

  // C22B — explanation word-overlap with correct option <= 30%
  const correctOption = q.options[q.correct_answer]
  const overlapPct = computeOverlap(correctOption, q.explanation)
  if (overlapPct > 30) {
    v.push({
      constraint: 'C22B',
      path: 'explanation',
      message: `Explanation overlaps correct option by ${overlapPct.toFixed(1)}% (max 30%).`,
    })
  }

  // C31 — textbook-reference filter on the stem
  const tbHits = detectTextbookReferences(q.question)
  if (tbHits.length > 0) {
    v.push({
      constraint: 'C31',
      path: 'question',
      message: `Stem contains pedagogical/source reference: "${tbHits[0].matchedText}" (${tbHits[0].category}).`,
    })
  }

  // C14 — numeric consistency for type E
  if (q.mcq_type === 'E') {
    if (!q.numeric.is_numeric) {
      v.push({ constraint: 'C14', path: 'numeric.is_numeric', message: 'Type E requires numeric.is_numeric = true.' })
    }
    if (!q.numeric.given_values || Object.keys(q.numeric.given_values).length === 0) {
      v.push({ constraint: 'C14', path: 'numeric.given_values', message: 'Type E requires given_values.' })
    }
    if (q.numeric.answer_value == null) {
      v.push({ constraint: 'C14', path: 'numeric.answer_value', message: 'Type E requires answer_value.' })
    }
    if (!q.numeric.calculation_steps || q.numeric.calculation_steps.length < 3) {
      v.push({ constraint: 'C14', path: 'numeric.calculation_steps', message: 'Type E requires >= 3 calculation_steps.' })
    }
    if (q.numeric.significant_figures == null) {
      v.push({ constraint: 'C14', path: 'numeric.significant_figures', message: 'Type E requires significant_figures.' })
    }
  } else {
    // Non-E: numeric must be the "not numeric" shape
    if (q.numeric.is_numeric) {
      v.push({ constraint: 'C14', path: 'numeric.is_numeric', message: `Type ${q.mcq_type} must have is_numeric = false.` })
    }
  }

  // C32 — tiered explanation word bounds
  const tiered = q.explanations_tiered
  const checkTiered = (field: keyof typeof WORD_BOUNDS, value: string, path: string) => {
    const [lo, hi] = WORD_BOUNDS[field]
    const wc = wordCount(value)
    if (wc < lo || wc > hi) {
      v.push({
        constraint: 'C32',
        path,
        message: `${path} must be ${lo}-${hi} words; got ${wc}.`,
      })
    }
  }
  checkTiered('definition_tiered', tiered.definition, 'explanations_tiered.definition')
  checkTiered('concept_summary', tiered.concept_summary, 'explanations_tiered.concept_summary')
  checkTiered('beginner', tiered.beginner, 'explanations_tiered.beginner')
  checkTiered('intermediate', tiered.intermediate, 'explanations_tiered.intermediate')
  checkTiered('advanced', tiered.advanced, 'explanations_tiered.advanced')
  checkTiered('revision_note_tiered', tiered.revision_note, 'explanations_tiered.revision_note')
  checkTiered('glossary_definition_tiered', tiered.glossary_entry.definition, 'explanations_tiered.glossary_entry.definition')
  checkTiered('flashcard_front_tiered', tiered.flashcard.front, 'explanations_tiered.flashcard.front')
  checkTiered('flashcard_back_tiered', tiered.flashcard.back, 'explanations_tiered.flashcard.back')
  if (tiered.reasoning_steps.length < 2) {
    v.push({ constraint: 'C32', path: 'explanations_tiered.reasoning_steps', message: 'Requires >= 2 reasoning_steps.' })
  }
  if (tiered.misconceptions.length < 1 || tiered.misconceptions.length > 4) {
    v.push({ constraint: 'C32', path: 'explanations_tiered.misconceptions', message: 'Requires 1-4 misconceptions.' })
  }
  if (tiered.related_concepts.length < 2) {
    v.push({ constraint: 'C32', path: 'explanations_tiered.related_concepts', message: 'Requires >= 2 related_concepts.' })
  }
  if (tiered.concept_map_nodes.length < 2) {
    v.push({ constraint: 'C32', path: 'explanations_tiered.concept_map_nodes', message: 'Requires >= 2 concept_map_nodes.' })
  }
  for (let i = 0; i < tiered.misconceptions.length; i++) {
    const [lo, hi] = WORD_BOUNDS.misconception
    const wc = wordCount(tiered.misconceptions[i])
    if (wc < lo || wc > hi) {
      v.push({ constraint: 'C32', path: `explanations_tiered.misconceptions[${i}]`, message: `Misconception ${i} must be ${lo}-${hi} words; got ${wc}.` })
    }
    if (/^(a student|students)\s+(think|believe|assume)/i.test(tiered.misconceptions[i])) {
      v.push({ constraint: 'C32', path: `explanations_tiered.misconceptions[${i}]`, message: 'Misconception must not use pedagogical framing ("A student thinks...").' })
    }
  }
  // E-type requires worked_solution >= 3 steps
  if (q.mcq_type === 'E' && tiered.worked_solution.length < 3) {
    v.push({ constraint: 'C32', path: 'explanations_tiered.worked_solution', message: 'Type E requires >= 3 worked_solution steps.' })
  }

  // C33 — visual system
  const vs = q.visual_system
  if (!vs.requires_visual) {
    // all other fields must be null
    const nonNullFields = [
      'visual_type', 'visual_title', 'visual_description', 'rendering_target',
      'rendering_engine', 'caption', 'accessibility_alt_text',
      'geometry_spec', 'graph_spec', 'table_spec', 'circuit_spec',
      'chemistry_spec', 'biology_spec', 'flowchart_spec', 'number_line_spec',
    ]
    for (const f of nonNullFields) {
       
      if ((vs as any)[f] != null) {
        v.push({ constraint: 'C33', path: `visual_system.${f}`, message: `requires_visual=false requires ${f} = null.` })
      }
    }
    if (vs.render_width_mm != null || vs.render_height_mm != null) {
      v.push({ constraint: 'C33', path: 'visual_system.render_width_mm', message: 'requires_visual=false requires render dimensions = null.' })
    }
  } else {
    if (!vs.visual_type) v.push({ constraint: 'C33', path: 'visual_system.visual_type', message: 'requires_visual=true requires visual_type.' })
    if (!vs.rendering_target) v.push({ constraint: 'C33', path: 'visual_system.rendering_target', message: 'requires_visual=true requires rendering_target.' })
    if (!vs.caption) v.push({ constraint: 'C33', path: 'visual_system.caption', message: 'requires_visual=true requires caption.' })
    if (!vs.accessibility_alt_text) v.push({ constraint: 'C33', path: 'visual_system.accessibility_alt_text', message: 'requires_visual=true requires accessibility_alt_text.' })
    // at least one spec must be non-null
    const specs = [vs.geometry_spec, vs.graph_spec, vs.table_spec, vs.circuit_spec, vs.chemistry_spec, vs.biology_spec, vs.flowchart_spec, vs.number_line_spec]
    if (specs.every((s) => s == null)) {
      v.push({ constraint: 'C33', path: 'visual_system', message: 'requires_visual=true requires at least one populated spec sub-object.' })
    }
    const [vtLo, vtHi] = WORD_BOUNDS.visual_title
    if (vs.visual_title) {
      const wc = wordCount(vs.visual_title)
      if (wc < vtLo || wc > vtHi) v.push({ constraint: 'C33', path: 'visual_system.visual_title', message: `visual_title must be ${vtLo}-${vtHi} words; got ${wc}.` })
    }
  }

  // C34 — layout_metadata
  const lm = q.layout_metadata
  if (lm.page_element_type !== 'mcq_block' && lm.heading_level == null) {
    v.push({ constraint: 'C34', path: 'layout_metadata.heading_level', message: 'Non-mcq_block page_element_type requires heading_level.' })
  }
  if (lm.page_element_type === 'mcq_block' && lm.heading_level != null) {
    v.push({ constraint: 'C34', path: 'layout_metadata.heading_level', message: 'mcq_block requires heading_level = null.' })
  }
  if ((lm.box_type === 'callout_box' || lm.box_type === 'warning_box') && lm.callout_style == null) {
    v.push({ constraint: 'C34', path: 'layout_metadata.callout_style', message: `${lm.box_type} requires callout_style.` })
  }
  if (lm.box_type !== 'callout_box' && lm.box_type !== 'warning_box' && lm.callout_style != null) {
    v.push({ constraint: 'C34', path: 'layout_metadata.callout_style', message: `${lm.box_type} requires callout_style = null.` })
  }
  if (!q.visual_system.requires_visual && lm.visual_anchor !== 'none') {
    v.push({ constraint: 'C34', path: 'layout_metadata.visual_anchor', message: 'requires_visual=false requires visual_anchor = "none".' })
  }

  // C35 — publishing_metadata
  const pm = q.publishing_metadata
  if (!pm.flashcard_front.endsWith('?')) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.flashcard_front', message: 'flashcard_front must end with "?".' })
  }
  const [pfLo, pfHi] = WORD_BOUNDS.publishing_flashcard_front
  const pfWc = wordCount(pm.flashcard_front)
  if (pfWc < pfLo || pfWc > pfHi) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.flashcard_front', message: `flashcard_front must be ${pfLo}-${pfHi} words; got ${pfWc}.` })
  }
  const [pbLo] = WORD_BOUNDS.publishing_flashcard_back
  if (wordCount(pm.flashcard_back) < pbLo) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.flashcard_back', message: `flashcard_back must be >= ${pbLo} words.` })
  }
  const [prLo, prHi] = WORD_BOUNDS.publishing_revision_note
  const prWc = wordCount(pm.revision_note)
  if (prWc < prLo || prWc > prHi) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.revision_note', message: `revision_note must be ${prLo}-${prHi} words; got ${prWc}.` })
  }
  const [gdLo, gdHi] = WORD_BOUNDS.publishing_glossary_definition
  const gdWc = wordCount(pm.glossary_definition)
  if (gdWc < gdLo || gdWc > gdHi) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.glossary_definition', message: `glossary_definition must be ${gdLo}-${gdHi} words; got ${gdWc}.` })
  }
  const [tnLo, tnHi] = WORD_BOUNDS.teacher_note
  const tnWc = wordCount(pm.teacher_note)
  if (tnWc < tnLo || tnWc > tnHi) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.teacher_note', message: `teacher_note must be ${tnLo}-${tnHi} words; got ${tnWc}.` })
  }
  const [smLo, smHi] = WORD_BOUNDS.solution_manual_note
  const smWc = wordCount(pm.solution_manual_note)
  if (smWc < smLo || smWc > smHi) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.solution_manual_note', message: `solution_manual_note must be ${smLo}-${smHi} words; got ${smWc}.` })
  }
  if (!pm.solution_manual_note.startsWith('Answer ')) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.solution_manual_note', message: 'solution_manual_note must start with "Answer ".' })
  }
  if (pm.concept_map_nodes.length < 2) {
    v.push({ constraint: 'C35', path: 'publishing_metadata.concept_map_nodes', message: 'Requires >= 2 concept_map_nodes.' })
  }

  // C15 — LaTeX well-formedness on every string-bearing field
  const latexPaths = [
    'question', 'hint', 'explanation',
    'options.A', 'options.B', 'options.C', 'options.D',
    'explanations_tiered.definition', 'explanations_tiered.beginner',
    'explanations_tiered.intermediate', 'explanations_tiered.advanced',
  ]
   
  const get = (p: string): string => p.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), q) ?? ''
  for (const p of latexPaths) {
    const issues = checkLatexString(get(p), p)
    for (const issue of issues) {
      v.push({ constraint: 'C15', path: p, message: issue.message })
    }
  }

  return v
}

/** Word-overlap percentage between correct option and explanation (C22B). */
function computeOverlap(option: string, explanation: string): number {
  if (!option) return 0
  const stop = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'to', 'and', 'in', 'that', 'this', 'it', 'for', 'on', 'with', 'as', 'by', 'be', 'or'])
  const optWords = new Set(
    option.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
      .filter((w) => w && !stop.has(w)),
  )
  if (optWords.size === 0) return 0
  const expWords = explanation.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)
  const shared = expWords.filter((w) => optWords.has(w)).length
  return (shared / optWords.size) * 100
}
