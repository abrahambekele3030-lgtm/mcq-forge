/**
 * mcq-forge — Spec v9 enumerated values
 *
 * Every enum here corresponds to an explicit allowed-values list in
 * mcq_engine_spec_v9.txt. The constraint number is cited in the comment.
 * These are the single source of truth — Zod schemas, prompts, and the
 * validator all import from here.
 */

// CONSTRAINT 7 — MCQ type definitions A–N
export const MCQ_TYPES = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
] as const
export type McqType = (typeof MCQ_TYPES)[number]

export const MCQ_TYPE_LABELS: Record<McqType, string> = {
  A: 'Definition recognition',
  B: 'Term identification',
  C: 'Formula recognition',
  D: 'Direct application',
  E: 'Numerical calculation',
  F: 'Conceptual reasoning',
  G: 'Cause-effect',
  H: 'Misconception-based',
  I: 'Comparison / contrast',
  J: 'Classification',
  K: 'Interpretation',
  L: 'Experimental / practical',
  M: 'Sequence / process order',
  N: 'Limitation / condition-based',
}

// CONSTRAINT 10 — difficulty levels
export const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard'] as const
export type Difficulty = (typeof DIFFICULTY_LEVELS)[number]

// CONSTRAINT 6 — coverage.structural_element_type
export const STRUCTURAL_ELEMENT_TYPES = [
  'section', 'subsection', 'sub_subsection', 'mini_heading',
  'activity', 'worked_example', 'exercise', 'key_term', 'review_question',
] as const
export type StructuralElementType = (typeof STRUCTURAL_ELEMENT_TYPES)[number]

// CONSTRAINT 32 — Bloom level (also referenced by CONSTRAINT 35 publishing_metadata)
export const BLOOM_LEVELS = [
  'Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create',
] as const
export type BloomLevel = (typeof BLOOM_LEVELS)[number]

// CONSTRAINT 33 — visual_system.visual_type
export const VISUAL_TYPES = [
  'geometry_diagram', 'number_line', 'coordinate_graph', 'scientific_graph',
  'bar_chart', 'pie_chart', 'scatter_plot', 'line_graph', 'flowchart',
  'circuit_diagram', 'chemical_structure', 'reaction_diagram',
  'biological_diagram', 'labeled_figure', 'data_table', 'concept_map_diagram',
] as const
export type VisualType = (typeof VISUAL_TYPES)[number]

// CONSTRAINT 33 — visual_system.rendering_target
export const RENDERING_TARGETS = [
  'matplotlib', 'plotly', 'tikz', 'graphviz', 'mermaid', 'reportlab', 'svg', 'smiles',
] as const
export type RenderingTarget = (typeof RENDERING_TARGETS)[number]

// CONSTRAINT 34 — layout_metadata.page_element_type
export const PAGE_ELEMENT_TYPES = [
  'mcq_block', 'definition_block', 'worked_example_block', 'callout_block',
  'warning_block', 'glossary_block', 'revision_block', 'table_block',
  'diagram_block', 'formula_block',
] as const
export type PageElementType = (typeof PAGE_ELEMENT_TYPES)[number]

// CONSTRAINT 34 — layout_metadata.suggested_placement
export const SUGGESTED_PLACEMENTS = [
  'main_column', 'left_column', 'right_column', 'margin_callout', 'full_width_band',
] as const
export type SuggestedPlacement = (typeof SUGGESTED_PLACEMENTS)[number]

// CONSTRAINT 34 — layout_metadata.visual_anchor
export const VISUAL_ANCHORS = [
  'inline', 'top_left', 'top_right', 'bottom_left', 'bottom_right', 'full_width', 'none',
] as const
export type VisualAnchor = (typeof VISUAL_ANCHORS)[number]

// CONSTRAINT 34 — layout_metadata.box_type
export const BOX_TYPES = [
  'standard_mcq', 'definition_box', 'example_box', 'callout_box', 'warning_box',
  'glossary_box', 'revision_box', 'formula_box', 'no_box',
] as const
export type BoxType = (typeof BOX_TYPES)[number]

// CONSTRAINT 34 — layout_metadata.preceding_element / following_element
export const PRECEDING_ELEMENTS = [
  'section_heading', 'subsection_heading', 'mini_heading', 'previous_mcq',
  'worked_example', 'diagram', 'table', 'none',
] as const
export type PrecedingElement = (typeof PRECEDING_ELEMENTS)[number]

export const FOLLOWING_ELEMENTS = [
  'next_mcq', 'section_heading', 'subsection_heading', 'diagram', 'table',
  'worked_example', 'glossary_entry', 'revision_note', 'none',
] as const
export type FollowingElement = (typeof FOLLOWING_ELEMENTS)[number]

// CONSTRAINT 34 — layout_metadata.callout_style
export const CALLOUT_STYLES = ['info', 'warning', 'tip', 'important', 'caution'] as const
export type CalloutStyle = (typeof CALLOUT_STYLES)[number]

// CONSTRAINT 35 — publishing_metadata.target_documents
export const TARGET_DOCUMENTS = [
  'question_bank', 'exam_paper', 'revision_guide', 'workbook',
  'teacher_guide', 'solution_manual', 'flashcard_deck', 'glossary', 'concept_map',
] as const
export type TargetDocument = (typeof TARGET_DOCUMENTS)[number]

// CONSTRAINT 35 — publishing_metadata.concept_map_nodes relation vocabulary
export const CONCEPT_MAP_RELATIONS = [
  'classified_as', 'requires', 'produces', 'example_of', 'opposite_of',
  'part_of', 'causes', 'measured_by', 'defined_as', 'applies_to',
  'contrasted_with', 'enables', 'tested_with', 'insoluble_in', // last two appear in real data; tolerated
] as const
export type ConceptMapRelation = (typeof CONCEPT_MAP_RELATIONS)[number]

// Engine version tag (CONSTRAINT 22)
export const ENGINE_VERSION = 'mcq_engine_spec_v9'

// CONSTRAINT 23 — batch size
export const BATCH_SIZE = 10

// CONSTRAINT 30 — safety limit
export const MAX_ROUNDS = 50

// CONSTRAINT 11.x — stem word counts by MCQ type
export const STEM_WORD_BOUNDS: Record<McqType, [number, number]> = {
  A: [18, 28], B: [15, 25], C: [18, 30], D: [18, 30], E: [15, 30],
  F: [20, 35], G: [18, 30], H: [22, 35], I: [18, 30], J: [15, 25],
  K: [20, 35], L: [20, 35], M: [15, 25], N: [20, 35],
}

// CONSTRAINT 11 — generic field word bounds
export const WORD_BOUNDS = {
  hint: [10, 15] as [number, number],
  explanation: [30, 40] as [number, number],
  option: [5, 12] as [number, number],
  definition_tiered: [15, 30] as [number, number],
  concept_summary: [30, 60] as [number, number],
  beginner: [20, 30] as [number, number],
  intermediate: [30, 40] as [number, number],
  advanced: [40, 50] as [number, number],
  revision_note_tiered: [8, 20] as [number, number],
  glossary_definition_tiered: [20, 40] as [number, number],
  flashcard_front_tiered: [5, 20] as [number, number],
  flashcard_back_tiered: [10, 40] as [number, number],
  visual_title: [3, 15] as [number, number],
  visual_description: [20, 60] as [number, number],
  caption: [5, 30] as [number, number],
  alt_text: [20, 80] as [number, number],
  publishing_flashcard_front: [5, 20] as [number, number],
  publishing_flashcard_back: [10, 40] as [number, number],
  publishing_glossary_definition: [20, 40] as [number, number],
  publishing_revision_note: [8, 20] as [number, number],
  teacher_note: [15, 50] as [number, number],
  solution_manual_note: [15, 50] as [number, number],
  misconception: [15, 40] as [number, number],
} as const

// CONSTRAINT 9 — MCQ type distribution targets across a full 100-question set
export const TYPE_DISTRIBUTION_TARGETS: Record<McqType, [number, number]> = {
  // PRIMARY
  F: [15, 20], D: [10, 15], G: [8, 12], H: [8, 12],
  // SECONDARY
  A: [6, 10], B: [6, 10], C: [6, 10],
  // SUPPORTING
  K: [5, 8], L: [5, 8], I: [4, 6], J: [3, 5], M: [3, 5], N: [3, 5],
  // numeric — capped
  E: [0, 20],
}

// CONSTRAINT 10 — difficulty distribution per batch of 10
export const DIFFICULTY_DISTRIBUTION = {
  easy: [2, 4] as [number, number],
  medium: [4, 6] as [number, number],
  hard: [1, 3] as [number, number],
}

// CONSTRAINT 9 — per-batch type rules
export const PER_BATCH_TYPE_RULES = {
  minDistinctTypes: 4,
  maxSameType: 3,
}

// Helper: word count (whitespace-split, robust to LaTeX)
export function wordCount(s: string | null | undefined): number {
  if (!s) return 0
  // Strip LaTeX commands so \mathrm{H_2SO_4} doesn't inflate the count
  const stripped = s
    .replace(/\\[a-zA-Z]+\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/\$\$?/g, ' ')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return 0
  return stripped.split(' ').length
}
