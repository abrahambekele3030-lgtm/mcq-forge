/**
 * mcq-forge API — Download the project source as a clean, deployable ZIP
 * GET /api/mcq/source
 *
 * Produces a ZIP that is ready to `git init && git add . && git push` and then
 * deploy on Render via the included render.yaml Blueprint.
 *
 * The route does THREE things beyond naive file-copying:
 *
 * 1. EXCLUDES all sandbox-only artifacts so the Git repo stays clean:
 *    node_modules, .next, .git, db/, uploads/, outputs/, download/, skills/,
 *    .zscripts/, tool-results/, upload/, mini-services/, Caddyfile (sandbox
 *    gateway), examples/ (sandbox demos), *.log, *.db, .env (secrets),
 *    worklog.md, next-env.d.ts, tsconfig.tsbuildinfo, .agent-browser*
 *
 * 2. SUBSTITUTES sanitized versions of config files that would otherwise
 *    carry sandbox-specific hacks:
 *    - package.json  → clean scripts (no `tee dev.log`, no standalone hack)
 *    - next.config.ts → keeps `output: standalone` (good for Docker) but clean
 *    - .gitignore     → comprehensive, covers all runtime artifacts
 *
 * 3. ADDS a SETUP.md quick-start guide at the zip root.
 */
import { NextResponse } from 'next/server'
import { promises as fsp } from 'node:fs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as fflate from 'fflate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// turbopackIgnore: prevent Turbopack from tracing the entire project at build
// time. This route reads files dynamically at RUNTIME (not build time), so the
// tracer's attempt to follow process.cwd() produces a spurious "unexpected
// file in NFT list" warning. The comment tells Turbopack to skip this call.
const PROJECT_ROOT = /* turbopackIgnore: true */ process.cwd()

/** Directories to skip entirely (by name, anywhere in the tree). */
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'db', 'uploads', 'outputs', 'download',
  'skills', '.zscripts', 'tool-results', 'upload', '.agent-browser',
  'mini-services', '.cache', 'coverage', 'out', 'build', 'examples',
])

/** Files to skip (by exact name). */
const SKIP_FILES = new Set([
  '.env', '.DS_Store', 'worklog.md', 'dev.log', 'server.log', 'caddy.log',
  'dev.out.log', 'next-env.d.ts', 'tsconfig.tsbuildinfo', 'Caddyfile',
  '.eslintcache',
])

/** Skip files matching these patterns. */
const SKIP_PATTERNS = [
  /\.db$/i,
  /\.db-journal$/i,
  /\.log$/i,
  /\.tsbuildinfo$/i,
  /\.pem$/i,
  /^\.env$/,           // never bundle the real .env (secrets)
]

/** Files that are substituted with a sanitized version instead of copied raw. */
const SUBSTITUTE: Record<string, () => Uint8Array> = {
  'package.json': () => new TextEncoder().encode(CLEAN_PACKAGE_JSON),
  'next.config.ts': () => new TextEncoder().encode(CLEAN_NEXT_CONFIG),
  '.gitignore': () => new TextEncoder().encode(CLEAN_GITIGNORE),
}

interface FileEntry {
  relPath: string
  bytes: Uint8Array
}

export async function GET() {
  try {
    const entries = await collectProjectFiles()
    const virtual: Record<string, Uint8Array> = {}

    for (const e of entries) {
      // Substitute sanitized content for config files that need it.
      const sub = SUBSTITUTE[e.relPath]
      virtual[e.relPath] = sub ? sub() : e.bytes
    }

    // Add a setup guide at the zip root.
    virtual['SETUP.md'] = new TextEncoder().encode(SETUP_TEXT)

    const zipped = fflate.zipSync(virtual, { level: 6 })

    return new NextResponse(zipped, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="mcq-forge.zip"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[mcq/source] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build source ZIP' },
      { status: 500 },
    )
  }
}

async function collectProjectFiles(): Promise<FileEntry[]> {
  const out: FileEntry[] = []

  async function walk(dir: string) {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = /* turbopackIgnore: true */ path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        await walk(full)
      } else if (entry.isFile()) {
        if (SKIP_FILES.has(entry.name)) continue
        if (SKIP_PATTERNS.some((re) => re.test(entry.name))) continue
        await addFile(full, out)
      }
    }
  }

  const topEntries = await fsp.readdir(PROJECT_ROOT, { withFileTypes: true })
  for (const entry of topEntries) {
    const full = /* turbopackIgnore: true */ path.join(PROJECT_ROOT, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.')) continue
      await walk(full)
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue
      if (SKIP_PATTERNS.some((re) => re.test(entry.name))) continue
      await addFile(full, out)
    }
  }

  return out
}

async function addFile(full: string, out: FileEntry[]) {
  try {
    const buf = await fsp.readFile(full)
    const rel = path.relative(PROJECT_ROOT, full).split(path.sep).join('/')
    out.push({ relPath: rel, bytes: new Uint8Array(buf) })
  } catch {
    // skip unreadable
  }
}

// ---------------------------------------------------------------------------
// Sanitized config files (substituted into the ZIP)
// ---------------------------------------------------------------------------

/**
 * Clean package.json with Render-deployable scripts.
 * - `dev`: plain `next dev` (no `tee dev.log` sandbox hack)
 * - `build`: `prisma generate && next build` (generates the Prisma client on
 *   the build server so Render's build step produces a working bundle)
 * - `start`: `next start` (Render sets PORT automatically; Next reads it)
 * - `postinstall`: `prisma generate` (ensures client exists even if build
 *   script is overridden)
 */
const CLEAN_PACKAGE_JSON = JSON.stringify({
  name: 'mcq-forge',
  version: '1.0.0',
  private: true,
  scripts: {
    dev: 'next dev',
    build: 'prisma generate && next build',
    start: 'next start',
    lint: 'eslint .',
    'db:push': 'prisma db push',
    'db:generate': 'prisma generate',
    'db:migrate': 'prisma migrate dev',
    'db:reset': 'prisma migrate reset',
    postinstall: 'prisma generate',
  },
  dependencies: readDeps(),
  devDependencies: readDevDeps(),
}, null, 2) + '\n'

function readDeps(): Record<string, string> {
  try {
    const raw = readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw)
    return pkg.dependencies ?? {}
  } catch {
    return {}
  }
}
function readDevDeps(): Record<string, string> {
  try {
    const raw = readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw)
    return pkg.devDependencies ?? {}
  } catch {
    return {}
  }
}

/** Clean next.config — keeps standalone output (good for Docker image size). */
const CLEAN_NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
`

/** Comprehensive .gitignore for a Next.js + Prisma project. */
const CLEAN_GITIGNORE = `# dependencies
node_modules/
/.pnp
.pnp.*
.yarn/*

# next.js
/.next/
/out/
/build/

# production
*.tsbuildinfo
next-env.d.ts

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# env files (NEVER commit secrets)
.env
.env.*
!.env.example

# prisma / database
/db/*.db
/db/*.db-journal
*.db
*.db-journal

# mcq-forge runtime artifacts
/uploads/
/outputs/
/download/

# logs
*.log
dev.log
server.log

# editor / OS
.vscode/
.idea/
*.swp
*.swo
Thumbs.db

# agent / sandbox artifacts
.agent-browser/
worklog.md
caddy.log
`

const SETUP_TEXT = `# mcq-forge — quick start

This ZIP is a clean, deployable copy of the mcq-forge project.
It is ready to push to GitHub and deploy on Render.

## 1. Run locally

\`\`\`bash
bun install               # or: npm install
cp .env.example .env      # then edit .env (see below)
bun run db:push           # create the SQLite database
bun run dev               # start the dev server on :3000
\`\`\`

### Environment variables (.env)

\`\`\`bash
MCQFORGE_PROVIDER=glm     # "glm" for GLM-4.7-Flash, or "mock" for offline testing
ZAI_API_KEY=your-key      # required when MCQFORGE_PROVIDER=glm
DATABASE_URL="file:./db/custom.db"
\`\`\`

### Offline / no-quota mode

Set \`MCQFORGE_PROVIDER=mock\` to run the full pipeline with a deterministic
mock LLM — no API key needed. Useful for UI walkthroughs.

## 2. Push to GitHub

\`\`\`bash
git init
git add .
git commit -m "mcq-forge: automated spec-v9 MCQ generation"
git branch -M main
git remote add origin https://github.com/<you>/mcq-forge.git
git push -u origin main
\`\`\`

## 3. Deploy on Render (free tier)

### Option A — Docker (recommended)

1. In Render: **New → Web Service → connect your GitHub repo**.
2. Choose **Docker** as the environment.
3. Render reads the included \`Dockerfile\`, which:
   - installs \`poppler-utils\` (provides \`pdftotext\` for PDF extraction),
   - runs \`bun install\` + \`bun run build\`,
   - starts \`bun run start\` on the port Render assigns.
4. Add an environment variable in Render's dashboard:
   - \`ZAI_API_KEY\` = your GLM API key
   - \`MCQFORGE_PROVIDER\` = \`glm\`
5. Deploy.

### Option B — Blueprint

1. In Render: **New → Blueprint → connect your repo**.
2. Render reads the included \`render.yaml\`.
3. Set \`ZAI_API_KEY\` as a secret in the dashboard.
4. Deploy.

### Persistence note (free tier)

Render free web services have **ephemeral filesystems** — SQLite and uploaded
PDFs are lost on redeploy. For persistence, either:
- Attach a 1 GB disk (paid) and uncomment the \`disk:\` block in render.yaml, or
- Switch \`DATABASE_URL\` to a free Neon/Supabase Postgres and change
  \`prisma/schema.prisma\` datasource provider to \`"postgresql"\`, then run
  \`bunx prisma db push\`.

See README.md for full architecture and API docs.
`
