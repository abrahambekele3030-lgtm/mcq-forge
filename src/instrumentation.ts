/**
 * mcq-forge — Next.js instrumentation hook
 *
 * Runs once when the server starts (before any request). This is the correct
 * place to boot the in-process job worker so it persists for the lifetime of
 * the server, independent of API request lifecycles.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (not during client bundle compilation).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureWorkerRunning } = await import('./lib/mcq-forge/pipeline/runner')
    ensureWorkerRunning()
    console.log('[mcq-forge] background worker started via instrumentation')
  }
}
