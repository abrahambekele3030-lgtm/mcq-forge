/**
 * mcq-forge — GLM-4.7-Flash LLM provider (default)
 *
 * Uses z-ai-web-dev-sdk's chat.completions.create with model "glm-4.7-flash".
 * This is the only file that knows about the SDK; everything upstream talks
 * to the {@link LLMProvider} interface.
 *
 * IMPORTANT — SDK authentication:
 * The z-ai-web-dev-sdk's ZAI.create() ONLY reads a `.z-ai-config` JSON file
 * from cwd/home//etc. It does NOT read ZAI_API_KEY/ZAI_BASE_URL env vars.
 * On hosts like Render, users set env vars (not config files), so this
 * provider writes a `.z-ai-config` file from env vars before instantiating
 * the SDK. This bridges the env-var → config-file gap.
 *
 * Required env vars:
 *   ZAI_API_KEY   — your GLM API key
 *   ZAI_BASE_URL  — the API base URL (e.g. https://api.z.ai/api/paas/v4)
 *   MCQFORGE_GLM_MODEL — (optional) defaults to "glm-4.7-flash"
 *
 * Resilience:
 *   - exponential backoff on 429/5xx
 *   - output-token cap enforced
 *   - markdown fences stripped before returning
 *   - abort signal honored
 */
import ZAI from 'z-ai-web-dev-sdk'
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ChatMessage, LlmCallOptions, LlmCallResult, LLMProvider } from './types'
import { backoffDelay, isRetryableError, stripCodeFences } from './types'

export interface GlmProviderOptions {
  apiKey?: string            // defaults to process.env.ZAI_API_KEY
  baseUrl?: string           // defaults to process.env.ZAI_BASE_URL
  model?: string             // defaults to "glm-4.7-flash"
  maxRetries?: number        // default 4
  defaultTemperature?: number
  defaultMaxTokens?: number
}

/** Default GLM API base URL if ZAI_BASE_URL is not set. */
const DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4'

/**
 * Ensure a `.z-ai-config` file exists with {baseUrl, apiKey} derived from env
 * vars. The z-ai-web-dev-sdk ONLY reads this file — it ignores env vars — so
 * we materialize it on disk before calling ZAI.create().
 *
 * If a valid config file already exists (e.g. user created one manually), we
 * leave it alone. If env vars are missing, we throw a clear error.
 */
function ensureZaiConfigFile(): { apiKey: string; baseUrl: string } {
  const configPath = path.join(process.cwd(), '.z-ai-config')

  // Read credentials from env vars.
  const apiKey = process.env.ZAI_API_KEY
  const baseUrl = process.env.ZAI_BASE_URL ?? DEFAULT_BASE_URL

  if (!apiKey) {
    throw new Error(
      '[mcq-forge] ZAI_API_KEY environment variable is not set.\n' +
      '  The GLM provider requires ZAI_API_KEY (and optionally ZAI_BASE_URL).\n' +
      '  Set them in .env (local) or the host environment (Render dashboard).\n' +
      '  Alternatively, set MCQFORGE_PROVIDER=mock to run without an LLM.'
    )
  }

  // If a valid config file already exists with matching credentials, skip.
  if (existsSync(configPath)) {
    try {
      const existing = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (existing.apiKey === apiKey && existing.baseUrl === baseUrl) {
        return { apiKey, baseUrl }
      }
    } catch {
      // fall through to overwrite
    }
  }

  // Write the config file.
  const config = { baseUrl, apiKey }
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })
    console.log(`[mcq-forge] wrote ${configPath} from ZAI_API_KEY / ZAI_BASE_URL env vars`)
  } catch (err) {
    throw new Error(
      `[mcq-forge] Failed to write .z-ai-config: ${err instanceof Error ? err.message : String(err)}.\n` +
      `  Ensure the working directory is writable, or create .z-ai-config manually with {"baseUrl":"${baseUrl}","apiKey":"<your-key>"}.`
    )
  }

  return { apiKey, baseUrl }
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
      // Write the config file from env vars BEFORE calling ZAI.create(),
      // because the SDK only reads the file, not env vars.
      ensureZaiConfigFile()
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
        const body: Record<string, unknown> = {
          model: this.model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }
        if (opts.seed != null) body.seed = opts.seed
         
        const res: any = await client.chat.completions.create(body as any)
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
