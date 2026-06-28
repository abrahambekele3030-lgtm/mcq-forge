/**
 * mcq-forge — Node.js-only instrumentation logic
 *
 * This module is imported ONLY by `instrumentation.ts` and ONLY when
 * `NEXT_RUNTIME === 'nodejs'`. It is safe to use Node.js built-ins here
 * (node:child_process, node:fs, etc.) because the edge runtime never
 * evaluates this file.
 *
 * Responsibilities:
 *   1. Ensure the database schema exists (run `prisma db push` if missing).
 *      This makes the app self-bootstrapping — no manual migration step needed.
 *   2. Start the in-process job worker (resilient to transient DB errors).
 */
import { execFileSync } from 'node:child_process'

export async function registerNode(): Promise<void> {
  // --- 1. Ensure the database schema exists ------------------------------
  // This is the fix for "The table public.Job does not exist". We run
  // `prisma db push` programmatically before the worker boots, so the tables
  // always exist. Idempotent: if they already exist, it's a fast no-op.
  if (process.env.MCQFORGE_SKIP_AUTO_MIGRATE !== 'true') {
    try {
      console.log('[mcq-forge] ensuring database schema exists (prisma db push)...')
      execFileSync('bunx', ['prisma', 'db', 'push', '--accept-data-loss', '--skip-generate'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
        env: process.env,
      })
      console.log('[mcq-forge] database schema is in sync')
    } catch (err) {
      // Don't crash the whole app if migration fails — the worker will retry
      // and the user can run `bun run db:push` manually.
      console.error('[mcq-forge] WARNING: prisma db push failed:', err instanceof Error ? err.message : String(err))
      console.error('[mcq-forge] The app will still boot. Run `bun run db:setup` to create tables.')
    }
  }

  // --- 2. Start the background worker ------------------------------------
  const { ensureWorkerRunning } = await import('./lib/mcq-forge/pipeline/runner')
  ensureWorkerRunning()
  console.log('[mcq-forge] background worker started via instrumentation')
}
