/**
 * mcq-forge — GLM-4.7-Flash LLM provider (default)
 *
 * Uses z-ai-web-dev-sdk's chat.completions.create with model "glm-4.7-flash".
 * This is the only file that knows about the SDK; everything upstream talks
 * to the {@link LLMProvider} interface.
 *
 * Resilience:
 *   - exponential backoff on 429/5xx (configurable via env)
 *   - output-token cap enforced
 *   - markdown fences stripped before returning
 *   - abort signal honored
 */
import ZAI from 'z-ai-web-dev-sdk'
import type { ChatMessage, LlmCallOptions, LlmCallResult, LLMProvider } from './types'
import { backoffDelay, isRetryableError, stripCodeFences } from './types'

export interface GlmProviderOptions {
  apiKey?: string            // defaults to process.env.ZAI_API_KEY
  baseUrl?: string           // defaults to process.env.ZAI_BASE_URL (SDK default if unset)
  model?: string             // defaults to "glm-4.7-flash"
  maxRetries?: number        // default 4
  defaultTemperature?: number
  defaultMaxTokens?: number
}

export class GlmProvider implements LLMProvider {
  readonly id = 'glm'
  readonly label = 'GLM-4.7-Flash (z-ai-web-dev-sdk)'
  private readonly model: string
  private readonly maxRetries: number
  private readonly defaultTemperature: number
  private readonly defaultMaxTokens: number
  private zaiPromise: Promise<ZAI> | null = null

  constructor(opts: GlmProviderOptions = {}) {
    this.model = opts.model ?? process.env.MCQFORGE_GLM_MODEL ?? 'glm-4.7-flash'
    this.maxRetries = opts.maxRetries ?? 4
    this.defaultTemperature = opts.defaultTemperature ?? 0.2
    this.defaultMaxTokens = opts.defaultMaxTokens ?? 4096
  }

  private async client(): Promise<ZAI> {
    if (!this.zaiPromise) {
      this.zaiPromise = ZAI.create()
    }
    return this.zaiPromise
  }

  async chat(messages: ChatMessage[], opts: LlmCallOptions = {}): Promise<LlmCallResult> {
    const client = await this.client()
    const temperature = opts.temperature ?? this.defaultTemperature
    const maxTokens = opts.maxTokens ?? this.defaultMaxTokens

    let lastErr: unknown
    let retries = 0
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (opts.signal?.aborted) throw new Error('aborted')
      const t0 = Date.now()
      try {
        // The SDK accepts an OpenAI-style body.
         
        const body: any = {
          model: this.model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }
        if (opts.seed != null) body.seed = opts.seed
        const res = await client.chat.completions.create(body)
        const content = stripCodeFences(
          (res?.choices?.[0]?.message?.content ?? '').toString(),
        )
        const usage = res?.usage
        return {
          content,
          usage: usage ? {
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          } : undefined,
          model: this.model,
          latencyMs: Date.now() - t0,
          retries,
        }
      } catch (err) {
        lastErr = err
        const status = extractStatus(err)
        if (attempt < this.maxRetries && isRetryableError(status, err) && !opts.signal?.aborted) {
          const delay = backoffDelay(attempt)
          retries++
          await sleep(delay)
          continue
        }
        break
      }
    }
    throw new Error(
      `GLM chat failed after ${retries} retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    )
  }
}

function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
   
  const e = err as any
  return e?.status ?? e?.statusCode ?? e?.response?.status
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
