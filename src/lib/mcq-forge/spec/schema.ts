/**
 * mcq-forge — Zod schema layer for spec v9
 *
 * This is the single source of truth for the shape of every R{n}.json file.
 * Generated files MUST pass `RoundFileSchema.parse()` before being written
 * to disk. A failed parse yields a structured error list that is fed back
 * to the LLM on retry (see pipeline/orchestrator.ts).
 *
 * Constraint citations refer to mcq_engine_spec_v9.txt.
 */
import { z } from 'zod'
import {
  MCQ_TYPES, DIFFICULTY_LEVELS, STRUCTURAL_ELEMENT_TYPES, BLOOM_LEVELS,
  VISUAL_TYPES, RENDERING_TARGETS, PAGE_ELEMENT_TYPES, SUGGESTED_PLACEMENTS,
  VISUAL_ANCHORS, BOX_TYPES, PRECEDING_ELEMENTS, FOLLOWING_ELEMENTS,
  CALLOUT_STYLES, TARGET_DOCUMENTS, CONCEPT_MAP_RELATIONS, ENGINE_VERSION,
} from './enums'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** A non-empty trimmed string. */
const ne = z.string().trim().min(1)

/** LaTeX string — must be a valid JSON string; well-formedness checked in latex.ts. */
const latex = z.string()

/** ISO-8601 timestamp. */
const iso = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
  'Must be ISO 8601 UTC, e.g. 2026-06-12T10:30:00Z'
)

/** question_id pattern: G10_Chem_U1_Q001 (CONSTRAINT 22) */
const questionIdRegex = /^[A-Z][0-9]+_[A-Za-z]+_U[0-9]+_Q[0-9]{3}$/

/** round_id pattern: R01..R50 (CONSTRAINT 22) */
const roundIdRegex = /^R(0[1-9]|[1-4][0-9]|50)$/

/** SHA-256 hex (CONSTRAINT 22 — used_question_signatures, validation_hash, concept_hash) */
const sha256 = z.string().regex(/^[a-f0-9]{64}$/, 'Must be a 64-char lowercase hex SHA-256')

// ---------------------------------------------------------------------------
// CONSTRAINT 32 — explanations_tiered
// ---------------------------------------------------------------------------

const glossaryEntrySchema = z.object({
  term: ne,
  definition: ne,
  example_equation: latex.nullable(),
  related_terms: z.array(ne).min(1),
})

const flashcardSchema = z.object({
  front: ne,
  back: ne,
})

const conceptMapNodeSchema = z.object({
  source: ne,
  relation: z.string().min(1),
  target: ne,
})

const formulaAnalysisItemSchema = z.object({
  formula: latex,
  name: ne,
  variables: z.array(z.object({
    symbol: latex,
    meaning: ne,
    unit: ne,
  })),
  derivation: z.string().nullable(),
})

export const explanationsTieredSchema = z.object({
  definition: ne,
  concept_summary: ne,
  beginner: ne,
  intermediate: ne,
  advanced: ne,
  worked_solution: z.array(ne),
  reasoning_steps: z.array(ne).min(2),
  formula_analysis: z.array(formulaAnalysisItemSchema),
  misconceptions: z.array(ne).min(1).max(4),
  related_concepts: z.array(ne).min(2),
  revision_note: ne,
  glossary_entry: glossaryEntrySchema,
  flashcard: flashcardSchema,
  concept_map_nodes: z.array(conceptMapNodeSchema).min(2),
})
export type ExplanationsTiered = z.infer<typeof explanationsTieredSchema>

// ---------------------------------------------------------------------------
// CONSTRAINT 33 — visual_system
// ---------------------------------------------------------------------------

const nullOrString = z.string().nullable()
const nullOrNumber = z.number().nullable()

const geometrySpecSchema = z.object({
  shapes: z.array(z.object({
    type: z.enum(['line', 'circle', 'triangle', 'rectangle', 'polygon', 'arc', 'angle']),
    vertices: z.array(z.array(z.number())),
    radius: z.number().nullable(),
    label: z.string().nullable(),
    style: z.enum(['solid', 'dashed']),
  })),
  labels: z.array(z.object({ text: z.string(), position: z.array(z.number()) })),
  axes: z.object({
    x_range: z.array(z.number()),
    y_range: z.array(z.number()),
    show_grid: z.boolean(),
  }),
  annotations: z.array(z.object({
    text: z.string(), from: z.array(z.number()), to: z.array(z.number()),
  })),
})

const graphSpecSchema = z.object({
  graph_type: z.string(),
  title: z.string(),
  x_axis: z.object({
    label: z.string(), unit: z.string().nullable(),
    range: z.array(z.number()).nullable(), tick_interval: z.number().nullable(),
  }),
  y_axis: z.object({
    label: z.string(), unit: z.string().nullable(),
    range: z.array(z.number()).nullable(), tick_interval: z.number().nullable(),
  }),
  series: z.array(z.object({
    name: z.string(),
    data_points: z.array(z.array(z.number())),
    color: z.string().nullable(),
    line_style: z.enum(['solid', 'dashed', 'dotted']).nullable(),
    marker: z.enum(['circle', 'square', 'triangle', 'none']).nullable(),
  })),
  annotations: z.array(z.object({
    text: z.string(), position: z.array(z.number()),
  })),
  legend_position: z.enum(['top_right', 'top_left', 'bottom_right', 'bottom_left', 'none']),
})

const tableSpecSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  column_alignments: z.array(z.enum(['left', 'center', 'right'])),
  header_style: z.enum(['bold', 'normal']),
  caption_position: z.enum(['above', 'below']),
})

const circuitSpecSchema = z.object({
  components: z.array(z.object({
    id: z.string(),
    type: z.enum(['resistor', 'capacitor', 'inductor', 'battery', 'switch', 'bulb', 'wire', 'ammeter', 'voltmeter', 'ground']),
    label: z.string().nullable(),
    value: z.string().nullable(),
    position: z.array(z.number()),
  })),
  connections: z.array(z.object({
    from_id: z.string(), to_id: z.string(), wire_style: z.enum(['straight', 'bent']),
  })),
  layout_type: z.enum(['series', 'parallel', 'mixed']),
})

const chemistrySpecSchema = z.object({
  representation_type: z.enum(['smiles', 'skeletal', '3d_coordinates', 'reaction_arrow']),
  smiles_strings: z.array(z.string()).nullable(),
  reaction_equation_latex: z.string().nullable(),
  reactants: z.array(z.object({
    name: z.string(), smiles: z.string().nullable(), formula_latex: z.string(),
  })),
  products: z.array(z.object({
    name: z.string(), smiles: z.string().nullable(), formula_latex: z.string(),
  })),
  conditions: z.string().nullable(),
})

const biologySpecSchema = z.object({
  diagram_name: z.string(),
  components: z.array(z.object({
    id: z.string(), label: z.string(), description: z.string().nullable(),
  })),
  arrows: z.array(z.object({
    from_id: z.string(), to_id: z.string(), label: z.string().nullable(),
  })),
  bounding_box: z.object({ width_mm: z.number(), height_mm: z.number() }),
  color_scheme: z.enum(['grayscale', 'color']),
})

const flowchartSpecSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(), label: z.string(),
    shape: z.enum(['rectangle', 'diamond', 'oval', 'parallelogram']),
  })),
  edges: z.array(z.object({
    from_id: z.string(), to_id: z.string(), label: z.string().nullable(),
  })),
  direction: z.enum(['top_down', 'left_right']),
})

const numberLineSpecSchema = z.object({
  range: z.array(z.number()),
  tick_interval: z.number(),
  marked_points: z.array(z.object({
    value: z.number(), label: z.string(), style: z.enum(['filled', 'open']),
  })),
  annotations: z.array(z.object({ text: z.string(), position: z.number() })),
})

export const visualSystemSchema = z.object({
  requires_visual: z.boolean(),
  visual_type: z.enum(VISUAL_TYPES).nullable(),
  visual_title: nullOrString,
  visual_description: nullOrString,
  rendering_target: z.enum(RENDERING_TARGETS).nullable(),
  rendering_engine: nullOrString,
  render_width_mm: nullOrNumber,
  render_height_mm: nullOrNumber,
  caption: nullOrString,
  accessibility_alt_text: nullOrString,
  geometry_spec: geometrySpecSchema.nullable(),
  graph_spec: graphSpecSchema.nullable(),
  table_spec: tableSpecSchema.nullable(),
  circuit_spec: circuitSpecSchema.nullable(),
  chemistry_spec: chemistrySpecSchema.nullable(),
  biology_spec: biologySpecSchema.nullable(),
  flowchart_spec: flowchartSpecSchema.nullable(),
  number_line_spec: numberLineSpecSchema.nullable(),
})
export type VisualSystem = z.infer<typeof visualSystemSchema>

// ---------------------------------------------------------------------------
// CONSTRAINT 34 — layout_metadata
// ---------------------------------------------------------------------------

export const layoutMetadataSchema = z.object({
  page_element_type: z.enum(PAGE_ELEMENT_TYPES),
  suggested_placement: z.enum(SUGGESTED_PLACEMENTS),
  visual_anchor: z.enum(VISUAL_ANCHORS),
  box_type: z.enum(BOX_TYPES),
  preceding_element: z.enum(PRECEDING_ELEMENTS),
  following_element: z.enum(FOLLOWING_ELEMENTS),
  page_break_before: z.boolean(),
  keep_with_next: z.boolean(),
  column_span: z.union([z.literal(1), z.literal(2)]),
  callout_style: z.enum(CALLOUT_STYLES).nullable(),
  heading_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
})
export type LayoutMetadata = z.infer<typeof layoutMetadataSchema>

// ---------------------------------------------------------------------------
// CONSTRAINT 35 — publishing_metadata
// ---------------------------------------------------------------------------

export const publishingMetadataSchema = z.object({
  target_documents: z.array(z.enum(TARGET_DOCUMENTS)).min(1),
  flashcard_deck: ne,
  flashcard_front: ne,
  flashcard_back: ne,
  glossary_term: ne,
  glossary_definition: ne,
  revision_note: ne,
  teacher_note: ne,
  bloom_level: z.enum(BLOOM_LEVELS),
  learning_objective_tag: ne,
  concept_map_nodes: z.array(conceptMapNodeSchema).min(2),
  workbook_section: ne,
  solution_manual_note: ne,
})
export type PublishingMetadata = z.infer<typeof publishingMetadataSchema>

// ---------------------------------------------------------------------------
// CONSTRAINT 6 — required question fields (core)
// ---------------------------------------------------------------------------

const numericSchema = z.object({
  is_numeric: z.boolean(),
  given_values: z.record(z.string(), z.object({
    magnitude: z.number(),
    unit: z.string(),
  })).nullable(),
  answer_value: z.number().nullable(),
  answer_unit: z.string().nullable(),
  calculation_steps: z.array(z.string()).nullable(),
  significant_figures: z.number().int().nullable(),
})

const coverageSchema = z.object({
  baseline: z.boolean(),
  importance_biased: z.boolean(),
  structural_element_type: z.enum(STRUCTURAL_ELEMENT_TYPES),
})

const explanationValidationSchema = z.object({
  word_overlap_percentage: z.number().min(0).max(100),
  named_concept_present: z.boolean(),
  distractor_error_identified: z.boolean(),
  educational_value_score: z.number().int().min(0).max(100),
})

const validationSchema = z.object({
  no_repetition_confirmed: z.boolean(),
  length_constraints_passed: z.boolean(),
  symbol_constraints_passed: z.boolean(),
  textbook_reference_clean: z.boolean(),
  option_parallelism_score: z.number().int().min(0).max(100),
  explanation_validation: explanationValidationSchema,
})

const sourceTraceSchema = z.object({
  pdf_unit: ne,
  section_anchor: ne,
  subsection_anchor: z.string(),
  structural_element: ne,
  content_anchor: ne,
  page_hint: z.number().int().nullable(),
  concept_hash: sha256,
})

const qualityMetricsSchema = z.object({
  stem_complexity_score: z.number().int().min(0).max(100),
  distractor_quality_score: z.number().int().min(0).max(100),
  cognitive_level: ne,
  exam_alignment_score: z.number().int().min(0).max(100),
})

export const questionSchema = z.object({
  question_id: z.string().regex(questionIdRegex),
  generation_timestamp: iso,
  grade: ne,
  subject: ne,
  unit: ne,
  section: ne,
  subsection: z.string(),
  sub_subsection: z.string().nullable(),
  structural_anchor: ne,
  mcq_type: z.enum(MCQ_TYPES),
  question: ne,
  options: z.object({
    A: ne, B: ne, C: ne, D: ne,
  }),
  correct_answer: z.enum(['A', 'B', 'C', 'D']),
  hint: ne,
  explanation: ne,
  difficulty_level: z.enum(DIFFICULTY_LEVELS),
  formula_used: z.array(latex),
  numeric: numericSchema,
  coverage: coverageSchema,
  validation: validationSchema,
  source_trace: sourceTraceSchema,
  quality_metrics: qualityMetricsSchema,
  explanations_tiered: explanationsTieredSchema,
  visual_system: visualSystemSchema,
  layout_metadata: layoutMetadataSchema,
  publishing_metadata: publishingMetadataSchema,
})
export type Question = z.infer<typeof questionSchema>

// ---------------------------------------------------------------------------
// __STATE__ (CONSTRAINT 22)
// ---------------------------------------------------------------------------

const baselineCounterEntrySchema = z.object({
  count: z.number().int().min(0),
  mini_headings_covered: z.array(z.string()),
  last_question_round: z.number().int().min(0),
})

export const stateSchema = z.object({
  current_round: z.number().int().min(1),
  last_question_id: z.string().regex(questionIdRegex),
  covered_sections: z.array(z.string()),
  used_question_signatures: z.array(z.string()),
  baseline_counter: z.record(z.string(), z.record(z.string(), baselineCounterEntrySchema)),
  structure_verified: z.boolean(),
  phase_status: z.object({
    phase1_complete: z.boolean(),
    phase2_complete: z.boolean(),
    phase3_started: z.boolean(),
  }),
  distribution_tracker: z.record(z.string(), z.object({
    question_count: z.number().int().min(0),
    last_used_round: z.number().int().min(0),
    consecutive_batches: z.number().int().min(0),
  })),
  exhaustion_attempts: z.number().int().min(0),
  concepts_mapped: z.record(z.string(), z.array(z.string())),
  baseline_complete: z.boolean(),
  validation_hash: z.string(),
  content_density_metrics: z.object({
    total_concepts_extracted: z.number().int().min(0),
    questions_per_concept_ratio: z.number().min(0),
    structural_coverage_percentage: z.number().min(0).max(100),
  }),
})
export type McqState = z.infer<typeof stateSchema>

// ---------------------------------------------------------------------------
// validation_report, batch_metrics, system_checks (CONSTRAINT 22)
// ---------------------------------------------------------------------------

const validationReportSchema = z.object({
  batch_validation: z.object({
    questions_validated: z.string(),
    regenerations_required: z.number().int().min(0),
    constraint_violations_caught: z.number().int().min(0),
    batch_status: z.enum(['PASSED', 'FAILED', 'PARTIAL']),
    validation_timestamp: iso,
  }),
  phase_status_report: z.object({
    phase1: z.object({
      complete: z.boolean(),
      sections_covered: z.number().int(),
      total_sections: z.number().int(),
      progress_percentage: z.number().min(0).max(100),
    }),
    phase2: z.object({
      complete: z.boolean(),
      max_imbalance_ratio: z.number(),
      balanced: z.boolean(),
    }),
    phase3: z.object({
      started: z.boolean(),
      exam_sections_biased: z.number().int(),
    }),
  }),
  coverage_metrics: z.object({
    total_questions_generated: z.number().int(),
    sections_covered_count: z.number().int(),
    subsections_covered_count: z.number().int(),
    mini_headings_covered_count: z.number().int(),
    structural_coverage_percentage: z.number().min(0).max(100),
    concept_utilization_ratio: z.number().min(0).max(1),
  }),
  distribution_analysis: z.object({
    most_covered_section: z.string(),
    least_covered_section: z.string(),
    imbalance_ratio: z.number(),
    section_rotation_compliant: z.boolean(),
  }),
  exhaustion_proof: z.object({
    exhaustion_claimed: z.boolean(),
    mathematical_proof_provided: z.boolean(),
    per_subsection_analysis: z.record(z.string(), z.object({
      concepts_available: z.number().int(),
      questions_generated: z.number().int(),
      ratio: z.number(),
    })),
    remaining_concept_capacity: z.number().int(),
  }),
  cheating_detection: z.object({
    phase_skipping_detected: z.boolean(),
    imbalance_detected: z.boolean(),
    overuse_detected: z.boolean(),
    early_stopping_attempted: z.boolean(),
  }),
  new_constraint_compliance: z.object({
    tiered_explanations_valid: z.boolean(),
    visual_system_valid: z.boolean(),
    layout_metadata_valid: z.boolean(),
    publishing_metadata_valid: z.boolean(),
  }),
})

const batchMetricsSchema = z.object({
  generation_time_ms: z.number().int().min(0),
  average_question_quality: z.number(),
  type_distribution: z.record(z.string(), z.number().int()),
  difficulty_distribution: z.record(z.string(), z.number().int()),
  section_distribution: z.record(z.string(), z.number().int()),
  tiered_explanation_word_counts: z.object({
    beginner_avg: z.number(),
    intermediate_avg: z.number(),
    advanced_avg: z.number(),
  }),
  visual_required_count: z.number().int(),
  flashcards_generated: z.number().int(),
  glossary_terms_generated: z.number().int(),
})

const systemChecksSchema = z.object({
  state_integrity_verified: z.boolean(),
  constraint_compliance: z.number(),
  exhaustion_detection_active: z.boolean(),
  phase_enforcement_active: z.boolean(),
  anti_cheat_active: z.boolean(),
  tiered_explanation_system_active: z.boolean(),
  visual_system_active: z.boolean(),
  layout_system_active: z.boolean(),
  publishing_system_active: z.boolean(),
})

// ---------------------------------------------------------------------------
// Round file (top-level)
// ---------------------------------------------------------------------------

export const roundFileSchema = z.object({
  engine_version: z.literal(ENGINE_VERSION),
  engine_timestamp: iso,
  round_id: z.string().regex(roundIdRegex),
  batch_sequence: z.number().int().min(1),
  __STATE__: stateSchema,
  grade: ne,
  subject: ne,
  unit: ne,
  pdf_filename: ne,
  generation_parameters: z.object({
    max_questions_per_concept: z.number().int(),
    min_questions_per_subsection: z.number().int(),
    max_imbalance_ratio: z.number(),
    exhaustion_threshold_attempts: z.number().int(),
  }),
  exhaustion_reached: z.boolean(),
  user_stopped: z.boolean(),
  safety_limit_triggered: z.boolean(),
  validation_report: validationReportSchema,
  questions: z.array(questionSchema).length(10),
  batch_metrics: batchMetricsSchema,
  system_checks: systemChecksSchema,
})
export type RoundFile = z.infer<typeof roundFileSchema>

// ---------------------------------------------------------------------------
// Structure (output of structure-detection phase, CONSTRAINT 1.5)
// ---------------------------------------------------------------------------

export const structureElementSchema = z.object({
  kind: z.enum([
    'section', 'subsection', 'sub_subsection', 'mini_heading',
    'activity', 'worked_example', 'exercise', 'key_term',
    'review_question', 'unit_outcome', 'project', 'summary',
  ]),
  number: z.string().nullable(),        // e.g. "1.1", "1.1.1", null for mini-headings
  title: ne,                            // exact text from PDF
  page_start: z.number().int().nullable(),
  page_end: z.number().int().nullable(),
  parent_path: z.array(z.string()),     // chain of ancestor titles
  concepts: z.array(z.string()),        // key concepts the LLM extracted for this element
})

export const structureSchema = z.object({
  unit_title: ne,
  grade: ne,
  subject: ne,
  unit_number: z.number().int().min(1),
  elements: z.array(structureElementSchema).min(1),
  total_counts: z.object({
    sections: z.number().int(),
    subsections: z.number().int(),
    sub_subsections: z.number().int(),
    mini_headings: z.number().int(),
    activities_exercises: z.number().int(),
    key_terms: z.number().int(),
  }),
  detected_at: iso,
  pdf_filename: ne,
  pdf_page_count: z.number().int(),
})
export type Structure = z.infer<typeof structureSchema>
export type StructureElement = z.infer<typeof structureElementSchema>
