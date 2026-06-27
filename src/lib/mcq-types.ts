// Types for the MCQ Generator engine

export type McqType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N'

export interface Question {
  question_id: string
  generation_timestamp: string | null
  grade: string
  subject: string
  unit: string
  section: string
  subsection: string
  sub_subsection: string | null
  structural_anchor: string | null
  mcq_type: McqType
  question: string
  options: Record<string, string>
  correct_answer: string
  hint: string | null
  explanation: string | null
  difficulty_level: 'easy' | 'medium' | 'hard'
  formula_used: string[]
  numeric: Record<string, unknown>
  coverage: Record<string, unknown>
  validation: Record<string, unknown>
  source_trace: Record<string, unknown> | null
  quality_metrics: Record<string, unknown> | null
  explanations_tiered: Record<string, unknown> | null
  visual_system: Record<string, unknown> | null
  layout_metadata: Record<string, unknown> | null
  publishing_metadata: Record<string, unknown> | null
  bloom_level: string | null
}

export interface EngineState {
  current_round: number
  last_question_id: string
  covered_sections: string[]
  used_question_signatures: string[]
  baseline_counter: Record<string, unknown>
  structure_verified: boolean
  phase_status: {
    phase1_complete: boolean
    phase2_complete: boolean
    phase3_started: boolean
  }
  distribution_tracker: Record<string, unknown>
  exhaustion_attempts: number
  concepts_mapped: Record<string, unknown>
  baseline_complete: boolean
  validation_hash: string
  content_density_metrics: Record<string, unknown>
}

export interface RJsonFile {
  engine_version: string
  engine_timestamp: string
  round_id: string
  batch_sequence: number
  __STATE__: EngineState
  grade: string
  subject: string
  unit: string
  pdf_filename: string
  generation_parameters: Record<string, unknown>
  exhaustion_reached: boolean
  user_stopped: boolean
  safety_limit_triggered: boolean
  validation_report: Record<string, unknown>
  questions: Question[]
  batch_metrics: Record<string, unknown> | null
  system_checks: Record<string, unknown> | null
}

export interface GenerationSession {
  id: string
  grade: string
  subject: string
  unit: string
  pdfFilename: string
  pdfText: string
  detectedStructure: string | null
  structureVerified: boolean
  rounds: RJsonFile[]
  currentState: EngineState | null
  status: 'idle' | 'extracting' | 'ingesting' | 'verifying' | 'generating' | 'exhausted' | 'error'
  error: string | null
  createdAt: number
}
