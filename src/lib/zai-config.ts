// Z-AI SDK initialization helper
// The SDK reads from a .z-ai-config JSON file, but for deployment (Render/Vercel)
// we need to support environment variables. This module creates the config file
// from env vars if it doesn't exist, or uses the existing one.

import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let initialized = false

/**
 * Initialize the Z-AI SDK config from environment variables.
 * Call this before ZAI.create() in any API route.
 *
 * Supports these env vars:
 *   ZAI_API_KEY     — the API key (required)
 *   ZAI_BASE_URL    — the base URL (optional, defaults to https://api.z.ai/v1)
 *
 * If ZAI_API_KEY is not set, the SDK will fall back to the .z-ai-config file
 * (useful for local dev where you've run `z-ai login` or created the file manually).
 */
export async function ensureZaiConfig(): Promise<void> {
  if (initialized) return

  const apiKey = process.env.ZAI_API_KEY
  if (!apiKey) {
    // No env var — SDK will use existing .z-ai-config file (local dev)
    initialized = true
    return
  }

  const baseUrl = process.env.ZAI_BASE_URL || 'https://api.z.ai/v1'

  // Write a config file that the SDK will find
  // The SDK checks process.cwd()/.z-ai-config first
  const configPath = join(process.cwd(), '.z-ai-config')
  const config = JSON.stringify({ baseUrl, apiKey })

  try {
    await writeFile(configPath, config, { mode: 0o600 })
  } catch {
    // If we can't write to cwd (read-only filesystem on some serverless platforms),
    // try the home directory or temp directory
    const homeConfig = join(process.env.HOME || tmpdir(), '.z-ai-config')
    try {
      await writeFile(homeConfig, config, { mode: 0o600 })
    } catch {
      // Last resort: temp directory — but the SDK doesn't check there,
      // so we'll need to set an env var the SDK might read
      console.warn('Could not write .z-ai-config file anywhere')
    }
  }

  initialized = true
}
