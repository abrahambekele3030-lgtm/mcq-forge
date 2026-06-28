/**
 * mcq-forge — Provider factory
 *
 * Selects the LLM provider based on MCQFORGE_PROVIDER env var.
 * Default: "glm". Use "mock" for offline development.
 */
import type { LLMProvider } from './types'
import { GlmProvider } from './glm'
import { MockProvider } from './mock'

let cached: LLMProvider | null = null

export function getProvider(): LLMProvider {
  if (cached) return cached
  const name = (process.env.MCQFORGE_PROVIDER ?? 'glm').toLowerCase()
  switch (name) {
    case 'mock':
      cached = new MockProvider()
      break
    case 'glm':
    default:
      cached = new GlmProvider()
      break
  }
  return cached
}

/** Allow tests to inject a custom provider. */
export function setProvider(p: LLMProvider): void {
  cached = p
}

export type { LLMProvider, ChatMessage, LlmCallOptions, LlmCallResult } from './types'
