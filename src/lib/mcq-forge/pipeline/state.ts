/**
 * mcq-forge — Deterministic __STATE__ computation
 *
 * The LLM never touches these fields. The orchestrator computes them from
 * the validated questions after every batch. This eliminates state drift,
 * ID collisions, and hash mismatches — the #5 corruption source in the
 * legacy dataset.
 */
import { createHash } from 'node:crypto'
import type { Question, McqState, Structure } from '../spec/schema'

export interface StateInputs {
  structure: Structure
  /** All questions generated so far, in order. */
  allQuestions: Question[]
  /** Current round number (1-based). */
  currentRound: number
  /** Previous state's validation_hash, or 'INITIAL' for the first batch. */
  previousHash: string
}

/** Compute the canonical concept_hash for a question's primary concept. */
export function conceptHash(conceptText: string): string {
  return createHash('sha256').update(conceptText.trim().toLowerCase()).digest('hex')
}

/** Compute a question signature: sha256(mcq_type + primary_concept + structural_anchor). */
export function questionSignature(q: Question): string {
  const primary = q.source_trace.content_anchor || q.question
  const sig = `${q.mcq_type}|${primary}|${q.structural_anchor}`
  return createHash('sha256').update(sig).digest('hex')
}

/** Compute the validation_hash of a state object (deterministic). */
export function stateHash(state: Omit<McqState, 'validation_hash'>): string {
  const canonical = JSON.stringify(state, Object.keys(state).sort())
  return createHash('sha256').update(canonical).digest('hex')
}

/** Compute the full __STATE__ object from validated questions. */
export function computeState(inputs: StateInputs): McqState {
  const { structure, allQuestions, currentRound, previousHash } = inputs

  // --- covered_sections: "Section>Subsection" pairs that have at least one question
  const covered = new Set<string>()
  for (const q of allQuestions) {
    covered.add(`${q.section}>${q.subsection || ''}`)
  }

  // --- used_question_signatures
  const signatures = allQuestions.map(questionSignature)

  // --- baseline_counter: {section: {subsection: {count, mini_headings_covered, last_question_round}}}
  const baselineCounter: McqState['baseline_counter'] = {}
  for (const q of allQuestions) {
    if (!baselineCounter[q.section]) baselineCounter[q.section] = {}
    const subKey = q.subsection || ''
    if (!baselineCounter[q.section][subKey]) {
      baselineCounter[q.section][subKey] = {
        count: 0,
        mini_headings_covered: [],
        last_question_round: 0,
      }
    }
    const entry = baselineCounter[q.section][subKey]
    entry.count++
    entry.last_question_round = Math.max(entry.last_question_round, currentRound)
    if (q.coverage.structural_element_type === 'mini_heading' && !entry.mini_headings_covered.includes(q.structural_anchor)) {
      entry.mini_headings_covered.push(q.structural_anchor)
    }
  }

  // --- phase_status
  const sections = structure.elements.filter((e) => e.kind === 'section')
  const subsections = structure.elements.filter((e) => e.kind === 'subsection' || e.kind === 'section')
  const phase1Complete =
    sections.every((s) => countInSection(allQuestions, s.title) >= 2) &&
    subsections.every((s) => countInSubsection(allQuestions, s.title) >= 2)

  // phase 2: no subsection has >3x the questions of any other
  const counts = Object.values(baselineCounter).flatMap((sec) => Object.values(sec).map((e) => e.count))
  const maxCount = counts.length ? Math.max(...counts) : 0
  const minCount = counts.length ? Math.min(...counts) : 0
  const phase2Complete = phase1Complete && counts.length > 0 && (minCount === 0 || maxCount <= minCount * 3)

  const phase3Started = phase2Complete

  // --- distribution_tracker
  const distributionTracker: McqState['distribution_tracker'] = {}
  for (const q of allQuestions) {
    if (!distributionTracker[q.section]) {
      distributionTracker[q.section] = { question_count: 0, last_used_round: 0, consecutive_batches: 0 }
    }
    distributionTracker[q.section].question_count++
    distributionTracker[q.section].last_used_round = Math.max(distributionTracker[q.section].last_used_round, currentRound)
  }
  // consecutive_batches: how many of the most recent rounds used this section
  const recentRoundSections = new Set(allQuestions.filter((q) => q.source_trace && true).map((q) => q.section))
  for (const sec of Object.keys(distributionTracker)) {
    distributionTracker[sec].consecutive_batches = recentRoundSections.has(sec) ? 1 : 0
  }

  // --- concepts_mapped: {section>subsection: [concept names]}
  const conceptsMapped: McqState['concepts_mapped'] = {}
  for (const q of allQuestions) {
    const key = `${q.section}>${q.subsection || ''}`
    if (!conceptsMapped[key]) conceptsMapped[key] = []
    const concept = q.source_trace.content_anchor
    if (!conceptsMapped[key].includes(concept)) conceptsMapped[key].push(concept)
  }

  // --- content_density_metrics
  const totalConcepts = Object.values(conceptsMapped).reduce((a, arr) => a + arr.length, 0)
  const structCount = structure.elements.length
  const coveredStructCount = new Set(allQuestions.map((q) => q.structural_anchor)).size
  const stateWithoutHash: Omit<McqState, 'validation_hash'> = {
    current_round: currentRound,
    last_question_id: allQuestions.length ? allQuestions[allQuestions.length - 1].question_id : `G00_None_U0_Q000`,
    covered_sections: Array.from(covered).sort(),
    used_question_signatures: signatures,
    baseline_counter: baselineCounter,
    structure_verified: true,
    phase_status: {
      phase1_complete: phase1Complete,
      phase2_complete: phase2Complete,
      phase3_started: phase3Started,
    },
    distribution_tracker: distributionTracker,
    exhaustion_attempts: 0,
    concepts_mapped: conceptsMapped,
    baseline_complete: phase1Complete,
    content_density_metrics: {
      total_concepts_extracted: totalConcepts,
      questions_per_concept_ratio: totalConcepts ? allQuestions.length / totalConcepts : 0,
      structural_coverage_percentage: structCount ? (coveredStructCount / structCount) * 100 : 0,
    },
  }

  return {
    ...stateWithoutHash,
    validation_hash: previousHash === 'INITIAL' ? 'INITIAL' : stateHash(stateWithoutHash),
  }
}

function countInSection(qs: Question[], section: string): number {
  return qs.filter((q) => q.section === section).length
}
function countInSubsection(qs: Question[], subsection: string): number {
  return qs.filter((q) => q.subsection === subsection || q.section === subsection).length
}
