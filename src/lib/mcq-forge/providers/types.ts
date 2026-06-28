/**
 * mcq-forge — LLM provider abstraction
 *
 * A single interface so the pipeline never knows which LLM is underneath.
 * The default implementation uses GLM-4.7-Flash via z-ai-web-dev-sdk.
 * Swapping providers (OpenAI, Anthropic, local Ollama) means adding one
 * adapter file and setting MCQFORGE_PROVIDER=<name>.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmCallOptions {
  /** Temperature 0..1. Lower = more deterministic. Default 0.2. */
  temperature?: number
  /** Max output tokens. Default 4096. */
  maxTokens?: number
  /** Optional seed for deterministic mode (provider-dependent). */
  seed?: number
  /** Abort signal for cancellation. */
  signal?: AbortSignal
}

export interface LlmCallResult {
  /** The model's text response (markdown fences stripped by the adapter). */
  content: string
  /** Best-effort token usage. */
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
  /** Provider-specific model identifier actually used. */
  model: string
  /** Wall-clock latency in ms. */
  latencyMs: number
  /** Number of retries performed inside the adapter (backoff). */
  retries: number
}

export interface LLMProvider {
  /** Stable identifier, e.g. "glm", "openai", "mock". */
  readonly id: string
  /** Human-readable label. */
  readonly label: string

  /**
   * Perform a chat completion. The adapter MUST:
   *   - request JSON-only output (no markdown fences) when `expectJson` is true
   *   - strip stray ```json fences defensively before returning
   *   - retry on 429/5xx with exponential backoff up to the configured budget
   *   - enforce the output-token cap
   *   - throw on terminal failure
   */
  chat(messages: ChatMessage[], opts?: LlmCallOptions): Promise<LlmCallResult>
}

// ---------------------------------------------------------------------------
// JSON extraction helpers (shared by all adapters)
// ---------------------------------------------------------------------------

/**
 * Strip markdown code fences and any leading/trailing prose, returning the
 * inner JSON text. Tolerant of ```json, ```JSON, ``` with no language, and
 * bare JSON. If no fence is found, returns the trimmed input.
 */
export function stripCodeFences(s: string): string {
  if (!s) return s
  let out = s.trim()
  // ```json ... ``` or ``` ... ```
  const fence = out.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/)
  if (fence) {
    out = fence[1].trim()
  }
  // Remove a leading "BATCH COMPLETE..." style trailer if present
  out = out.replace(/\n*BATCH COMPLETE.*$/i, '').trim()
  return out
}

/**
 * Extract the first balanced JSON object/array from a string that may contain
 * leading/trailing prose. Used as a last-resort recovery before parsing.
 */
export function extractFirstJson(s: string): string | null {
  if (!s) return null
  const start = s.search(/[\[{]/)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (escaped) { escaped = false; continue }
    if (c === '\\') { escaped = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Backoff helper
// ---------------------------------------------------------------------------

/** Exponential backoff with jitter. Returns the delay in ms for attempt `n` (0-indexed). */
export function backoffDelay(n: number, baseMs = 1000, maxMs = 30000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** n)
  return Math.round(exp * (0.5 + Math.random() * 0.5))
}

/** True if an HTTP status / error should trigger a retry. */
export function isRetryableError(status: number | undefined, err?: unknown): boolean {
  if (status != null && (status === 429 || status >= 500)) return true
  if (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/rate.?limit|timeout|econnreset|enotfound|socket hang up|5\d\d/i.test(msg)) return true
  }
  return false
}
