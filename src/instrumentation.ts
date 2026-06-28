/**
 * mcq-forge — Next.js instrumentation hook (edge-safe entry point)
 *
 * This file is loaded in ALL runtimes (nodejs + edge). It MUST NOT import any
 * Node.js built-ins at the top level — doing so produces an Edge Runtime
 * build warning. All Node.js-specific work is delegated to
 * `instrumentation-node.ts`, which is imported lazily ONLY when running in
 * the Node.js runtime.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the Node.js server runtime (not during edge/worker compilation).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Delegate to the Node.js-only module. The dynamic import string is
  // statically analyzable, but Next.js instrumentation is designed to
  // support this pattern — the edge runtime never evaluates this branch.
  const { registerNode } = await import('./instrumentation-node')
  await registerNode()
}
