/**
 * mcq-forge — build the deployable source ZIP and save it to /download/
 *
 * Run: bun run scripts/build-source-zip.ts
 *
 * Produces: download/mcq-forge.zip  (clean, Git-ready, Render-deployable)
 *
 * This is the SAME logic as /api/mcq/source but writes a physical file to
 * disk instead of streaming an HTTP response, so the user can grab it from
 * the download folder without depending on the dev server.
 */
import { promises as fsp } from 'node:fs'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import * as fflate from 'fflate'

const PROJECT_ROOT = path.resolve(import.meta.dir, '..')
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'download')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'mcq-forge.zip')

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'db', 'uploads', 'outputs', 'download',
  'skills', '.zscripts', 'tool-results', 'upload', '.agent-browser',
  'mini-services', '.cache', 'coverage', 'out', 'build', 'examples',
])

const SKIP_FILES = new Set([
  '.env', '.DS_Store', 'worklog.md', 'dev.log', 'server.log', 'caddy.log',
  'dev.out.log', 'next-env.d.ts', 'tsconfig.tsbuildinfo', 'Caddyfile',
  '.eslintcache',
])

const SKIP_PATTERNS = [
  /\.db$/i, /\.db-journal$/i, /\.log$/i, /\.tsbuildinfo$/i, /\.pem$/i, /^\.env$/,
]

interface FileEntry { relPath: string; bytes: Uint8Array }

async function collect(): Promise<FileEntry[]> {
  const out: FileEntry[] = []
  async function walk(dir: string) {
    let entries: import('node:fs').Dirent[]
    try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        await walk(full)
      } else if (entry.isFile()) {
        if (SKIP_FILES.has(entry.name)) continue
        if (SKIP_PATTERNS.some((re) => re.test(entry.name))) continue
        const buf = await fsp.readFile(full)
        const rel = path.relative(PROJECT_ROOT, full).split(path.sep).join('/')
        out.push({ relPath: rel, bytes: new Uint8Array(buf) })
      }
    }
  }
  const top = await fsp.readdir(PROJECT_ROOT, { withFileTypes: true })
  for (const entry of top) {
    const full = path.join(PROJECT_ROOT, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.')) continue
      await walk(full)
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue
      if (SKIP_PATTERNS.some((re) => re.test(entry.name))) continue
      const buf = await fsp.readFile(full)
      const rel = path.relative(PROJECT_ROOT, full).split(path.sep).join('/')
      out.push({ relPath: rel, bytes: new Uint8Array(buf) })
    }
  }
  return out
}

function readDeps(): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'))
    return pkg.dependencies ?? {}
  } catch { return {} }
}
function readDevDeps(): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'))
    return pkg.devDependencies ?? {}
  } catch { return {} }
}

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
    'db:setup': 'bash scripts/db-setup.sh',
    'db:migrate': 'prisma migrate dev',
    'db:reset': 'prisma migrate reset',
    postinstall: 'prisma generate',
  },
  dependencies: readDeps(),
  devDependencies: readDevDeps(),
}, null, 2) + '\n'

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
bun run db:push           # create the PostgreSQL tables
bun run dev               # start the dev server on :3000
\`\`\`

### Environment variables (.env)

The schema uses **PostgreSQL**. Set DATABASE_URL to your Postgres connection
string (free options: Neon at neon.tech, Supabase, or Render Postgres):

\`\`\`bash
MCQFORGE_PROVIDER=glm     # "glm" for GLM-4.7-Flash, or "mock" for offline testing
ZAI_API_KEY=your-key      # required when MCQFORGE_PROVIDER=glm
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
\`\`\`

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

### Option A — Blueprint (recommended)

1. In Render: **New → Blueprint → connect your repo**.
2. Render reads the included \`render.yaml\`, which creates:
   - a free PostgreSQL database (\`mcq-forge-db\`),
   - the web service, wired to that database via DATABASE_URL.
3. Set \`ZAI_API_KEY\` as a secret in the dashboard.
4. Deploy. The Dockerfile runs \`prisma db push\` on startup to create tables.

### Option B — Manual Docker

1. Create a PostgreSQL database on Render (or Neon/Supabase).
2. In Render: **New → Web Service → connect your GitHub repo** → Docker.
3. Add environment variables:
   - \`DATABASE_URL\` = your Postgres connection string
   - \`ZAI_API_KEY\` = your GLM API key
   - \`MCQFORGE_PROVIDER\` = \`glm\`
4. Deploy.

See README.md for full architecture and API docs.
`

async function main() {
  console.log('[build-source-zip] collecting files from', PROJECT_ROOT)
  const entries = await collect()
  const virtual: Record<string, Uint8Array> = {}

  for (const e of entries) {
    if (e.relPath === 'package.json') {
      virtual[e.relPath] = new TextEncoder().encode(CLEAN_PACKAGE_JSON)
    } else if (e.relPath === 'next.config.ts') {
      virtual[e.relPath] = new TextEncoder().encode(CLEAN_NEXT_CONFIG)
    } else if (e.relPath === '.gitignore') {
      virtual[e.relPath] = new TextEncoder().encode(CLEAN_GITIGNORE)
    } else {
      virtual[e.relPath] = e.bytes
    }
  }

  virtual['SETUP.md'] = new TextEncoder().encode(SETUP_TEXT)

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const zipped = fflate.zipSync(virtual, { level: 6 })
  await fsp.writeFile(OUTPUT_FILE, zipped)

  const sizeKB = (zipped.length / 1024).toFixed(1)
  console.log(`[build-source-zip] wrote ${OUTPUT_FILE} (${sizeKB} KB, ${entries.length + 1} entries)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
