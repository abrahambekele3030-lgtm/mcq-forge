/**
 * mcq-forge — Textbook-reference & pedagogical-framing filter
 *
 * Implements the *intent* of spec Constraint 31 (textbook-reference elimination)
 * and Constraint 20 (pedagogical neutrality). We use our own original regex
 * categories rather than copying any pattern list, so the detector is easy to
 * extend and audit. Each category covers a family of forbidden framings:
 *
 *   - direct source attribution  ("according to the textbook/PDF/unit/chapter...")
 *   - learning-process framing   ("students learn/are taught...", "in a lesson...")
 *   - structural-element refs     ("in Activity 1.1", "Example 2.3 shows...")
 *   - metalinguistic refs         ("the text/passage/material states...")
 *   - assessment framing          ("this question tests...", "the exam requires...")
 *   - temporal/sequential refs    ("earlier in the unit", "previously you learned...")
 *   - authority attribution       ("scientists state", "researchers found...")
 *   - figure/table/diagram refs   ("Figure 7.2 shows", "Table 7-1 indicates...")
 *
 * A question stem that matches any category is flagged for regeneration.
 */

export interface TextbookRefHit {
  category: string
  pattern: string
  matchedText: string
}

const CATEGORIES: { name: string; patterns: RegExp[] }[] = [
  {
    name: 'direct_source_attribution',
    patterns: [
      /\baccording to (the|this)\s+(textbook|pdf|unit|chapter|reading|passage|material|source)\b/i,
      /\bas (described|stated|mentioned|shown|explained|illustrated) (in|by) (the|this)\s+(textbook|pdf|unit|chapter|reading|passage|material|source)\b/i,
      /\bthe (textbook|pdf|unit|chapter|reading passage|source material|learning material)\s+(states|describes|shows|indicates|mentions|presents)\b/i,
      /\bbased on (the|your)\s+(reading|study|textbook|material|pdf)\b/i,
      /\bin this (chapter|unit|module|section|subject|course)\b/i,
    ],
  },
  {
    name: 'learning_process_framing',
    patterns: [
      /\b(students|you) (learn|are taught|have learned|studied|were taught|are learning)\b/i,
      /\ba student (learns|is taught|thinks|believes|assumes|concludes)\b/i,
      /\b(in a|during a|in the) (lesson|class|lecture|instruction|tutorial|session) (about|on|where)\b/i,
      /\bthe (teacher|instructor|curriculum|syllabus)\s+(explains|teaches|includes|describes|requires)\b/i,
      /\b(learning|educational) (objective|outcome|goal|aim|standard|competency)\s+\d/i,
      /\bperformance indicator\s+\d/i,
      /\b(having|after) (studied|learned|completed|read) (about|the|this)\b/i,
    ],
  },
  {
    name: 'structural_element_reference',
    patterns: [
      /\bin (activity|exercise|example|practice problem|worked example|investigation|experiment|demonstration|case study|project)\s+[\d.]+\b/i,
      /\b(activity|exercise|example|practice problem|worked example|investigation|experiment|demonstration|case study|project)\s+[\d.]+\s+(shows|demonstrates|illustrates|reveals|asks|involves|describes)\b/i,
      /\bkey term\s+\d/i,
      /\breview (question|exercise)\s+[\d.]+\b/i,
    ],
  },
  {
    name: 'metalinguistic_reference',
    patterns: [
      /\bthe (text|passage|reading|material|content|information|documentation|resource|literature|publication)\s+(defines|explains|describes|shows|states|indicates|mentions|presents)\b/i,
    ],
  },
  {
    name: 'assessment_framing',
    patterns: [
      /\bthis (question|assessment|exam|test|quiz|assignment|evaluation)\s+(tests|requires|covers|includes|involves|asks)\b/i,
      /\bthe (exam|test|quiz|assessment|evaluation|assignment)\s+(question\s+)?(tests|requires|covers|includes|involves|asks)\b/i,
      /\bevaluation criter/i,
    ],
  },
  {
    name: 'temporal_sequential_reference',
    patterns: [
      /\b(earlier|previously) (in|during) (the|this) (unit|chapter|lesson|module|section|discussion)\b/i,
      /\bprevious (lessons|activities|readings|studies|examples|discussions|instruction)\b/i,
      /\binitial instruction\b/i,
    ],
  },
  {
    name: 'authority_attribution',
    patterns: [
      /\b(scientists|researchers|experts|authorities|specialists|professionals|scholars|theorists|practitioners|analysts)\s+(state|found|agree|indicate|recommend|argue|propose|suggest|conclude)\b/i,
    ],
  },
  {
    name: 'figure_table_reference',
    patterns: [
      /\b(figure|fig\.?|table|diagram|chart|graph|illustration|image|schematic|visualization|model)\s+[\d.-]+\s+(shows|indicates|illustrates|demonstrates|depicts|represents)\b/i,
    ],
  },
]

/** Check a single string for textbook-reference violations. */
export function detectTextbookReferences(s: string): TextbookRefHit[] {
  if (!s) return []
  const hits: TextbookRefHit[] = []
  for (const cat of CATEGORIES) {
    for (const pat of cat.patterns) {
      const m = s.match(pat)
      if (m) {
        hits.push({
          category: cat.name,
          pattern: pat.source,
          matchedText: m[0],
        })
      }
    }
  }
  return hits
}

/**
 * Transform pedagogical framing into standalone fact form (CONSTRAINT 11.xxx).
 * Strips common framing prefixes. Returns the cleaned string.
 */
export function transformPedagogicalToStandalone(s: string): string {
  if (!s) return s
  let out = s
  // Strip leading framing clauses
  out = out.replace(
    /^\s*(the (textbook|unit|chapter|pdf|material|passage|reading)\s+(states|describes|shows|indicates|mentions|presents|explains)\s+(that\s+)?)\s*/i,
    '',
  )
  out = out.replace(
    /^\s*(according to (the|this) (textbook|unit|chapter|pdf|material|passage|reading),?\s*)\s*/i,
    '',
  )
  out = out.replace(
    /^\s*(as (described|stated|shown|explained) (in|by) (the|this) (textbook|unit|chapter|pdf|material),?\s*)\s*/i,
    '',
  )
  out = out.replace(/^\s*(in this (chapter|unit|module|section),?\s*)\s*/i, '')
  out = out.replace(/^\s*(students (learn|are taught) that,?\s*)\s*/i, '')
  out = out.replace(/^\s*(a student (learns|is taught|thinks|believes) that,?\s*)\s*/i, '')
  return out.trim()
}
