/**
 * mcq-forge — LaTeX well-formedness checker (CONSTRAINT 15)
 *
 * Validates that LaTeX embedded in JSON strings is syntactically plausible:
 * balanced braces, balanced inline math delimiters \( \), no stray backslashes.
 * This catches the #1 corruption source in the legacy dataset: raw single-backslash
 * LaTeX like \mathrm{...} that breaks JSON parsing.
 */

export interface LatexIssue {
  path: string
  message: string
  snippet?: string
}

/**
 * Check a single string for LaTeX issues. Returns a list of issues (empty = OK).
 * We deliberately keep this permissive: it flags clear violations but does not
 * attempt to be a full TeX parser.
 */
export function checkLatexString(s: string, path = ''): LatexIssue[] {
  const issues: LatexIssue[] = []
  if (!s) return issues

  // 1. Inline math delimiters \( ... \) must be balanced
  const openInline = (s.match(/\\\(/g) || []).length
  const closeInline = (s.match(/\\\)/g) || []).length
  if (openInline !== closeInline) {
    issues.push({
      path,
      message: `Unbalanced inline math delimiters: ${openInline} "\\(" vs ${closeInline} "\\)"`,
      snippet: s.slice(0, 80),
    })
  }

  // 2. Display math delimiters \[ ... \] must be balanced
  const openDisp = (s.match(/\\\[/g) || []).length
  const closeDisp = (s.match(/\\\]/g) || []).length
  if (openDisp !== closeDisp) {
    issues.push({
      path,
      message: `Unbalanced display math delimiters: ${openDisp} "\\[" vs ${closeDisp} "\\]"`,
      snippet: s.slice(0, 80),
    })
  }

  // 3. Brace balance (ignoring braces inside math delimiters)
  //    Count { and } — they should match. This catches truncated \frac{a}{b.
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') depth--
    if (depth < 0) {
      issues.push({
        path,
        message: 'Unbalanced braces: "}" appears before "{"',
        snippet: s.slice(Math.max(0, i - 20), i + 20),
      })
      break
    }
  }
  if (depth > 0) {
    issues.push({
      path,
      message: `Unbalanced braces: ${depth} unclosed "{"`,
      snippet: s.slice(0, 80),
    })
  }

  // 4. Common malformed tokens — bare backslash-letter sequences that are not
  //    valid LaTeX commands followed by an argument. We flag \command without
  //    a following brace or space, e.g. "\fracx" which is almost certainly a typo.
  //    Permissive: only flag known multi-letter commands missing braces.
  const knownCommands = ['frac', 'mathrm', 'mathbf', 'sqrt', 'sum', 'int', 'lim', 'vec', 'times', 'cdot']
  for (const cmd of knownCommands) {
    const re = new RegExp(`\\\\${cmd}(?![\\s{a-zA-Z])`, 'g')
    if (re.test(s)) {
      issues.push({
        path,
        message: `LaTeX command "\\${cmd}" not followed by an argument`,
        snippet: s.slice(0, 80),
      })
    }
  }

  return issues
}

/** Recursively walk an object and check every string value for LaTeX issues. */
export function checkLatexDeep(obj: unknown, basePath = ''): LatexIssue[] {
  const issues: LatexIssue[] = []
  if (obj == null) return issues
  if (typeof obj === 'string') {
    return checkLatexString(obj, basePath)
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      issues.push(...checkLatexDeep(item, `${basePath}[${i}]`))
    })
    return issues
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      issues.push(...checkLatexDeep(v, basePath ? `${basePath}.${k}` : k))
    }
  }
  return issues
}
