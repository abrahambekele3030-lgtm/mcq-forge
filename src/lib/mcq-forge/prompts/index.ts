/**
 * mcq-forge — Prompt templates
 *
 * Original prompts written for mcq-forge. They instruct the LLM to return
 * raw JSON (no markdown fences) and encode the structural requirements of
 * spec v9 (constraint numbers cited in comments) without reproducing the
 * spec text.
 */
import type { Structure, StructureElement, Question } from '../spec/schema'
import type { McqType } from '../spec/enums'
import { MCQ_TYPE_LABELS, STEM_WORD_BOUNDS } from '../spec/enums'

// ---------------------------------------------------------------------------
// Shared system prompt preamble
// ---------------------------------------------------------------------------

const SYSTEM_PREAMBLE = `You are the mcq-forge deterministic MCQ generation engine.
You generate EXAM-GRADE multiple-choice questions from a textbook PDF.

ABSOLUTE OUTPUT RULES:
1. Return ONLY raw JSON. No markdown. No code fences. No prose before or after.
2. Every LaTeX expression MUST be a valid JSON string with doubled backslashes.
   Example: write "\\\\mathrm{H_2SO_4}" (four backslashes in the JSON source) to represent \\mathrm{H_2SO_4}.
   Inline math is wrapped in \\( ... \\) which in JSON is \\\\( ... \\\\).
3. Never reference the textbook, PDF, unit, chapter, lesson, teacher, students, learning,
   activity, exercise, or example by name. Present all facts as standalone universal truths.
4. If you cannot satisfy a constraint, return {"error": "<short reason>"} instead of partial output.

You operate inside an automated pipeline. A machine validator will parse your JSON.
Any syntax error or schema violation causes an automatic retry with the error message
appended to this conversation. Be precise.`

// ---------------------------------------------------------------------------
// Structure detection prompt (CONSTRAINT 0, 1, 1.5)
// ---------------------------------------------------------------------------

export interface StructureDetectionContext {
  pdfFilename: string
  pageCount: number
  grade: string
  subject: string
  unitNumber: number
  /** First N pages of text (enough to detect unit title + contents). */
  previewText: string
}

export function buildStructureDetectionMessages(ctx: StructureDetectionContext) {
  const system = `${SYSTEM_PREAMBLE}

TASK: Detect the hierarchical structure of this textbook unit.

Return JSON with EXACTLY this shape:
{
  "unit_title": string,            // exact title from the PDF (e.g. "THE NUMBER SYSTEM")
  "grade": string,                 // e.g. "Grade 9"
  "subject": string,               // e.g. "Mathematics"
  "unit_number": number,
  "elements": [
    {
      "kind": "section" | "subsection" | "sub_subsection" | "mini_heading" |
              "activity" | "worked_example" | "exercise" | "key_term" |
              "review_question" | "unit_outcome" | "project" | "summary",
      "number": string | null,     // "1.1", "1.1.1", or null for unnumbered
      "title": string,             // EXACT text from the PDF
      "page_start": number | null,
      "page_end": number | null,
      "parent_path": string[],     // ancestor titles, root-to-parent
      "concepts": string[]         // 2-6 key concepts the LLM extracts for this element
    }
  ],
  "total_counts": {
    "sections": number, "subsections": number, "sub_subsections": number,
    "mini_headings": number, "activities_exercises": number, "key_terms": number
  },
  "detected_at": "<ISO 8601 UTC>",
  "pdf_filename": string,
  "pdf_page_count": number
}

DETECTION RULES:
- A line ending with ":" that is short (<60 chars) and not a full sentence is likely a mini-heading.
- Numbered patterns like "1.1", "1.2.3" indicate section/subsection/sub-subsection depth.
- "Activity N.N", "Example N.N", "Exercise N.N" are special structural elements.
- "Key Terms", "Summary", "Review Exercise" are unnumbered end-of-unit elements.
- "Learning Outcomes" / "Unit Outcomes" is a unit_outcome element.
- Extract page numbers from the PDF page markers in the text (format: <<<PAGE N>>>).
- concepts[] should be 2-6 concrete concept names a question could test (e.g. "natural numbers", "Ohm's Law").
- parent_path lists ancestor titles from root down to this element's parent.
- Do NOT invent elements that are not present in the text.`

  const user = `PDF: ${ctx.pdfFilename} (${ctx.pageCount} pages)
Grade: ${ctx.grade}
Subject: ${ctx.subject}
Unit number: ${ctx.unitNumber}

TEXT PREVIEW (first portion of the PDF, with page markers):
<<<BEGIN PDF TEXT>>>
${ctx.previewText}
<<<END PDF TEXT>>>

Detect the complete hierarchical structure. Return ONLY the JSON object.`

  return {
    system,
    user,
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ],
    maxTokens: 6000,
  }
}

// ---------------------------------------------------------------------------
// Question generation prompt (CONSTRAINT 5, 6, 7, 11, 15, 22, 32, 33, 34, 35)
// ---------------------------------------------------------------------------

export interface QuestionGenContext {
  grade: string
  subject: string
  unit: string
  /** The structural element to generate a question about. */
  element: StructureElement
  /** Content text for this element (token-bounded chunk). */
  contentText: string
  /** MCQ type to generate (the orchestrator picks this). */
  mcqType: McqType
  /** Sequence number for question_id (1-based). */
  sequenceNumber: number
  /** question_id prefix, e.g. "G09_Math_U1". */
  idPrefix: string
  /** Previously used concept hashes (to avoid repetition). */
  usedConcepts: string[]
  /** Target difficulty for this question. */
  difficulty: 'easy' | 'medium' | 'hard'
}

export function buildQuestionGenMessages(ctx: QuestionGenContext) {
  const typeLabel = MCQ_TYPE_LABELS[ctx.mcqType]
  const [stemMin, stemMax] = STEM_WORD_BOUNDS[ctx.mcqType]
  const questionId = `${ctx.idPrefix}_Q${String(ctx.sequenceNumber).padStart(3, '0')}`

  const system = `${SYSTEM_PREAMBLE}

TASK: Generate exactly ONE multiple-choice question of type ${ctx.mcqType} (${typeLabel}).

OUTPUT: a single JSON object matching this contract. ALL fields are required.
Use the exact field names. Use null (not undefined) for nullable fields when empty.

{
  "question_id": "${questionId}",
  "generation_timestamp": "<ISO 8601 UTC, e.g. 2026-06-12T10:30:00Z>",
  "grade": "${ctx.grade}",
  "subject": "${ctx.subject}",
  "unit": <exact unit title>,
  "section": <exact section title from PDF>,
  "subsection": <exact subsection title, or "">,
  "sub_subsection": <exact sub-subsection, or null>,
  "structural_anchor": <exact mini-heading or element label text>,
  "mcq_type": "${ctx.mcqType}",
  "question": <stem, ${stemMin}-${stemMax} words, LaTeX for all math>,
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "correct_answer": "A" | "B" | "C" | "D",
  "hint": <10-15 words, points to concept not answer>,
  "explanation": <30-40 words, EXACTLY 2 sentences: (1) why correct, naming the concept; (2) why a specific distractor is wrong>,
  "difficulty_level": "${ctx.difficulty}",
  "formula_used": [<LaTeX strings>, or []],
  "numeric": {
    "is_numeric": <true iff type E>,
    "given_values": <object or null>,
    "answer_value": <number or null>,
    "answer_unit": <string or null>,
    "calculation_steps": <array of strings or null>,
    "significant_figures": <int or null>
  },
  "coverage": {
    "baseline": true,
    "importance_biased": false,
    "structural_element_type": <one of: section, subsection, sub_subsection, mini_heading, activity, worked_example, exercise, key_term, review_question>
  },
  "validation": {
    "no_repetition_confirmed": true,
    "length_constraints_passed": true,
    "symbol_constraints_passed": true,
    "textbook_reference_clean": true,
    "option_parallelism_score": <0-100>,
    "explanation_validation": {
      "word_overlap_percentage": <0-100, must be <= 30>,
      "named_concept_present": true,
      "distractor_error_identified": true,
      "educational_value_score": <0-100>
    }
  },
  "source_trace": {
    "pdf_unit": <unit title>,
    "section_anchor": <section>,
    "subsection_anchor": <subsection or "">,
    "structural_element": <structural_anchor>,
    "content_anchor": <short phrase from PDF>,
    "page_hint": <int or null>,
    "concept_hash": <64-char lowercase hex SHA-256 of the primary concept text>
  },
  "quality_metrics": {
    "stem_complexity_score": <0-100>,
    "distractor_quality_score": <0-100>,
    "cognitive_level": <Bloom verb string>,
    "exam_alignment_score": <0-100>
  },
  "explanations_tiered": {
    "definition": <15-30 words>,
    "concept_summary": <30-60 words>,
    "beginner": <20-30 words, with an analogy>,
    "intermediate": <30-40 words, naming the concept>,
    "advanced": <40-50 words, with LaTeX if a formula applies>,
    "worked_solution": <[] for non-E; >= 3 steps for E, each with LaTeX>,
    "reasoning_steps": <array, >= 2 imperative statements>,
    "formula_analysis": <[] or array of {formula,name,variables:[{symbol,meaning,unit}],derivation}>,
    "misconceptions": <array, 1-4 entries, each 15-40 words, format "[False belief] is incorrect because [reason].">,
    "related_concepts": <array, >= 2 concept names>,
    "revision_note": <8-20 words>,
    "glossary_entry": {
      "term": <exact concept name>,
      "definition": <20-40 words>,
      "example_equation": <LaTeX or null>,
      "related_terms": <array, >= 1>
    },
    "flashcard": { "front": <5-20 words ending with "?">, "back": <10-40 words> },
    "concept_map_nodes": <array, >= 2 of {source, relation, target}>
  },
  "visual_system": {
    "requires_visual": <bool>,
    "visual_type": <one of the allowed types, or null>,
    "visual_title": <3-15 words or null>,
    "visual_description": <20-60 words or null>,
    "rendering_target": <matplotlib|plotly|tikz|graphviz|mermaid|reportlab|svg|smiles, or null>,
    "rendering_engine": <string or null>,
    "render_width_mm": <40-190 or null>,
    "render_height_mm": <30-250 or null>,
    "caption": <5-30 words or null>,
    "accessibility_alt_text": <20-80 words or null>,
    "geometry_spec": <object or null>,
    "graph_spec": <object or null>,
    "table_spec": <object or null>,
    "circuit_spec": <object or null>,
    "chemistry_spec": <object or null>,
    "biology_spec": <object or null>,
    "flowchart_spec": <object or null>,
    "number_line_spec": <object or null>
  },
  "layout_metadata": {
    "page_element_type": "mcq_block",
    "suggested_placement": "main_column",
    "visual_anchor": "none" | "inline" (inline only if requires_visual),
    "box_type": "standard_mcq",
    "preceding_element": "section_heading",
    "following_element": "next_mcq",
    "page_break_before": false,
    "keep_with_next": true,
    "column_span": 1,
    "callout_style": null,
    "heading_level": null
  },
  "publishing_metadata": {
    "target_documents": <array, min 1, from: question_bank, exam_paper, revision_guide, workbook, teacher_guide, solution_manual, flashcard_deck, glossary, concept_map>,
    "flashcard_deck": "<Subject> <Unit> — <Topic>",
    "flashcard_front": <5-20 words, ends with "?">,
    "flashcard_back": <10-40 words>,
    "glossary_term": <exact term>,
    "glossary_definition": <20-40 words>,
    "revision_note": <8-20 words>,
    "teacher_note": <15-50 words>,
    "bloom_level": <Remember|Understand|Apply|Analyse|Evaluate|Create>,
    "learning_objective_tag": <verb-led statement>,
    "concept_map_nodes": <array, >= 2 of {source, relation, target}>,
    "workbook_section": <exact section title>,
    "solution_manual_note": <15-50 words, MUST start with "Answer ">
  }
}

CONSTRAINTS (summary):
- Stem: ${stemMin}-${stemMax} words. Type ${ctx.mcqType} = ${typeLabel}.
- Options: 5-12 words each, grammatically parallel, identical units if numeric.
- Exactly one correct answer. No "all/none of the above".
- Correct-answer letter must vary; do not always pick "A".
- Explanation: 30-40 words, exactly 2 sentences, <= 30% word overlap with the correct option.
- Never reference the textbook, unit, chapter, activity, example, exercise, students, teacher, or learning.
- If type E: numeric.is_numeric=true, provide given_values, answer_value, answer_unit, >= 3 calculation_steps, significant_figures.
- If requires_visual=false: all visual sub-fields must be null.
- concept_hash: a 64-char lowercase hex string (SHA-256 of the primary concept text).
- ALL LaTeX in JSON must use doubled backslashes: \\\\mathrm, \\\\(, \\\\), \\\\frac, etc.
- Return ONLY the JSON object. No markdown, no prose.`

  const user = `STRUCTURAL ELEMENT TO TEST:
  kind: ${ctx.element.kind}
  number: ${ctx.element.number ?? '(unnumbered)'}
  title: ${ctx.element.title}
  parent_path: ${ctx.element.parent_path.join(' > ') || '(root)'}
  concepts available: ${ctx.element.concepts.join(', ') || '(none listed — infer from content)'}

CONTENT FROM THE PDF FOR THIS ELEMENT (pages ${ctx.element.page_start ?? '?'}–${ctx.element.page_end ?? '?'}):
<<<BEGIN CONTENT>>>
${ctx.contentText}
<<<END CONTENT>>>

QUESTION ID (use exactly): ${questionId}
TARGET DIFFICULTY: ${ctx.difficulty}

${ctx.usedConcepts.length > 0 ? `CONCEPTS ALREADY USED (avoid these — generate a question on a different aspect): ${ctx.usedConcepts.join(', ')}` : 'No concepts used yet for this element.'}

Generate ONE question of type ${ctx.mcqType} about this element. Return ONLY the JSON object.`

  return {
    system,
    user,
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: user },
    ],
    maxTokens: 4096,
    questionId,
  }
}

// ---------------------------------------------------------------------------
// Retry-with-error prompt (appended on validation failure)
// ---------------------------------------------------------------------------

export function buildRetryMessages(
  originalMessages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  badResponse: string,
  errors: string[],
) {
  return [
    ...originalMessages,
    { role: 'assistant' as const, content: badResponse.slice(0, 8000) },
    {
      role: 'user' as const,
      content: `Your previous response FAILED validation with these errors:

${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Regenerate the COMPLETE JSON object, fixing every error. Return ONLY the corrected JSON.`,
    },
  ]
}

// Re-export types for callers
export type { Structure, Question }
