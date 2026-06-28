/**
 * mcq-forge — Deterministic mock LLM provider
 *
 * Returns canned, schema-valid JSON so the pipeline, UI, and deployment can
 * be exercised end-to-end without spending API quota. Enabled by setting
 * MCQFORGE_PROVIDER=mock. NEVER used in production.
 */
import type { ChatMessage, LlmCallOptions, LlmCallResult, LLMProvider } from './types'

export class MockProvider implements LLMProvider {
  readonly id = 'mock'
  readonly label = 'Mock (deterministic, no network)'
  private counter = 0

  async chat(messages: ChatMessage[], opts: LlmCallOptions = {}): Promise<LlmCallResult> {
    if (opts.signal?.aborted) throw new Error('aborted')
    const sys = messages.find((m) => m.role === 'system')?.content ?? ''
    const usr = messages.find((m) => m.role === 'user')?.content ?? ''
    this.counter++
    const content = mockResponse(sys, usr, this.counter)
    return {
      content,
      usage: { inputTokens: Math.ceil(usr.length / 4), outputTokens: Math.ceil(content.length / 4), totalTokens: Math.ceil((usr.length + content.length) / 4) },
      model: 'mock-1',
      latencyMs: 5,
      retries: 0,
    }
  }
}

function mockResponse(sys: string, usr: string, n: number): string {
  if (sys.includes('hierarchical structure') || sys.includes('Detect the')) {
    return JSON.stringify({
      unit_title: 'Mock Unit: The Number System',
      grade: 'Grade 9',
      subject: 'Mathematics',
      unit_number: 1,
      elements: [
        { kind: 'section', number: '1.1', title: 'Revision on Natural Numbers and Integers', page_start: 1, page_end: 5, parent_path: [], concepts: ['natural numbers', 'integers'] },
        { kind: 'subsection', number: '1.1.1', title: 'Natural Numbers', page_start: 1, page_end: 2, parent_path: ['Revision on Natural Numbers and Integers'], concepts: ['counting numbers'] },
        { kind: 'mini_heading', number: null, title: 'Definition:', page_start: 1, page_end: 1, parent_path: ['Revision on Natural Numbers and Integers', 'Natural Numbers'], concepts: ['definition'] },
        { kind: 'activity', number: '1.1', title: 'Activity 1.1', page_start: 2, page_end: 3, parent_path: ['Revision on Natural Numbers and Integers'], concepts: ['listing numbers'] },
        { kind: 'key_term', number: null, title: 'Key Terms', page_start: 4, page_end: 5, parent_path: [], concepts: ['integer', 'natural number'] },
        { kind: 'review_question', number: null, title: 'Review Exercise', page_start: 5, page_end: 5, parent_path: [], concepts: ['review'] },
      ],
      total_counts: { sections: 1, subsections: 1, sub_subsections: 0, mini_headings: 1, activities_exercises: 1, key_terms: 2 },
      detected_at: new Date().toISOString(),
      pdf_filename: 'mock.pdf',
      pdf_page_count: 5,
    })
  }
  if (sys.includes('ONE multiple-choice question') || sys.includes('mcq_type')) {
    // Return one schema-valid mock question. The orchestrator fills metadata.
    const id = `G09_Math_U1_Q${String(n).padStart(3, '0')}`
    return JSON.stringify({
      question_id: id,
      generation_timestamp: new Date().toISOString(),
      grade: 'Grade 9',
      subject: 'Mathematics',
      unit: 'Mock Unit: The Number System',
      section: 'Revision on Natural Numbers and Integers',
      subsection: 'Natural Numbers',
      sub_subsection: null,
      structural_anchor: 'Definition:',
      mcq_type: 'A',
      question: 'Which of the following sets contains only natural numbers as defined in standard arithmetic, beginning at one and increasing without bound?',
      options: {
        A: 'The set of positive counting integers starting from one',
        B: 'The set of whole numbers including zero and negatives',
        C: 'The set of positive and negative fractional values',
        D: 'The set of non-positive integers including zero',
      },
      correct_answer: 'A',
      hint: 'Recall that natural numbers are the positive counting integers used in arithmetic.',
      explanation: 'Natural numbers begin at unity and extend indefinitely through successive additions of one. Option B wrongly admits zero and negative values, which belong to the broader integer family rather than this subset.',
      difficulty_level: 'easy',
      formula_used: [],
      numeric: { is_numeric: false, given_values: null, answer_value: null, answer_unit: null, calculation_steps: null, significant_figures: null },
      coverage: { baseline: true, importance_biased: false, structural_element_type: 'mini_heading' },
      validation: {
        no_repetition_confirmed: true,
        length_constraints_passed: true,
        symbol_constraints_passed: true,
        textbook_reference_clean: true,
        option_parallelism_score: 95,
        explanation_validation: { word_overlap_percentage: 12, named_concept_present: true, distractor_error_identified: true, educational_value_score: 88 },
      },
      source_trace: { pdf_unit: 'Mock Unit: The Number System', section_anchor: 'Revision on Natural Numbers and Integers', subsection_anchor: 'Natural Numbers', structural_element: 'Definition:', content_anchor: 'natural numbers are counting numbers', page_hint: 1, concept_hash: 'a'.repeat(64) },
      quality_metrics: { stem_complexity_score: 60, distractor_quality_score: 80, cognitive_level: 'remembering', exam_alignment_score: 90 },
      explanations_tiered: {
        definition: 'A natural number is any positive integer used for counting and ordering, beginning at one and increasing indefinitely through successive addition of one.',
        concept_summary: 'Natural numbers constitute the most fundamental number set in mathematics, representing the positive integers used for enumeration. They serve as the foundational building block upon which the broader number systems including integers, rational numbers, and real numbers are subsequently constructed and formally defined.',
        beginner: 'Think of natural numbers like counting apples one by one. You start at the first apple and keep going upward without ever stopping or reaching a final count.',
        intermediate: 'Natural numbers are the set of positive integers beginning at one and extending indefinitely, denoted by the symbol N. They are used for counting discrete objects and form the basis upon which integers and rational numbers are formally defined.',
        advanced: 'The set of natural numbers is formally defined as the set containing one, two, three, and so forth indefinitely. This set exhibits closure under the operations of addition and multiplication, yet it lacks closure under subtraction and division, necessitating the construction of integers and rational numbers as extensions.',
        worked_solution: [],
        reasoning_steps: ['Identify the set of natural numbers as positive integers.', 'Exclude zero, negatives, and fractions.', 'Confirm option A contains only positive integers.'],
        formula_analysis: [],
        misconceptions: ['Including zero among natural numbers is incorrect because zero is neither positive nor negative, and natural numbers are strictly positive counting integers beginning at one.'],
        related_concepts: ['Integers', 'Whole numbers', 'Rational numbers'],
        revision_note: 'Natural numbers are positive counting integers starting from one and increasing indefinitely.',
        glossary_entry: { term: 'Natural number', definition: 'A natural number is a positive integer beginning at one and increasing without bound, used for counting and ordering discrete quantities in mathematics.', example_equation: '\\(\\mathbb{N} = \\{1, 2, 3, \\ldots\\}\\)', related_terms: ['integer', 'whole number'] },
        flashcard: { front: 'Which set contains only positive counting integers beginning at one?', back: 'The natural numbers are the positive counting integers beginning at one and increasing without bound through successive addition.' },
        concept_map_nodes: [
          { source: 'Numbers', relation: 'classified_as', target: 'Natural Numbers' },
          { source: 'Natural Numbers', relation: 'part_of', target: 'Integers' },
        ],
      },
      visual_system: {
        requires_visual: false, visual_type: null, visual_title: null, visual_description: null,
        rendering_target: null, rendering_engine: null, render_width_mm: null, render_height_mm: null,
        caption: null, accessibility_alt_text: null,
        geometry_spec: null, graph_spec: null, table_spec: null, circuit_spec: null,
        chemistry_spec: null, biology_spec: null, flowchart_spec: null, number_line_spec: null,
      },
      layout_metadata: {
        page_element_type: 'mcq_block', suggested_placement: 'main_column', visual_anchor: 'none',
        box_type: 'standard_mcq', preceding_element: 'section_heading', following_element: 'next_mcq',
        page_break_before: false, keep_with_next: true, column_span: 1, callout_style: null, heading_level: null,
      },
      publishing_metadata: {
        target_documents: ['question_bank', 'exam_paper'],
        flashcard_deck: 'Mathematics Unit 1 — Natural Numbers',
        flashcard_front: 'What is the smallest element of the natural number set?',
        flashcard_back: 'The smallest natural number is one, since the set begins at one and increases indefinitely through successive additions of one.',
        glossary_term: 'Natural number',
        glossary_definition: 'A natural number is any member of the set of positive integers used for counting, beginning at one and extending indefinitely without bound.',
        revision_note: 'Natural numbers begin at one and extend indefinitely as positive counting integers.',
        teacher_note: 'Students frequently include zero among the natural numbers. Emphasise that the natural number set begins at one, while the whole numbers separately include zero as an additional element.',
        bloom_level: 'Remember',
        learning_objective_tag: 'Describe natural numbers and distinguish them from integers',
        concept_map_nodes: [
          { source: 'Numbers', relation: 'classified_as', target: 'Natural Numbers' },
          { source: 'Natural Numbers', relation: 'part_of', target: 'Integers' },
        ],
        workbook_section: 'Revision on Natural Numbers and Integers',
        solution_manual_note: 'Answer A. Natural numbers are the positive counting integers beginning at one. Option B is a common error because it includes zero and negatives, which belong to the integers.',
      },
    })
  }
  return '{}'
}
