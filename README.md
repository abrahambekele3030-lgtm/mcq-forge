# mcq-forge

**Automated, spec-v9 compliant MCQ generation from textbook PDFs.**

mcq-forge replaces the manual, error-prone workflow of prompting an LLM chat
to produce `R1.json … Rn.json` files. Upload a textbook PDF, review the detected
structure, and mcq-forge generates validated, deterministic, spec-compliant
question files using **GLM-4.7-Flash** — one question at a time, with a
machine validator in the loop and retry-with-error feedback.

The output ZIP drops straight into [ExamPrep Studio](./upload/examprep-studio.zip)
in the exact `data/<Subject>/<Grade_X>/<Unit_Y>/Rn.json` layout — but always
valid JSON, so the downstream repair pipeline becomes unnecessary.

---

## Why mcq-forge exists

The legacy `data.zip` dataset has a **46% corruption rate** (219 of 479 files
are unparseable JSON). The five root causes — all structural, not model-quality
problems — are documented in the design analysis. mcq-forge eliminates them by:

1. **Per-question generation** instead of monolithic 20K-token batches.
2. **JSON-only output** (no markdown code fences, no "BATCH COMPLETE" prose).
3. **Zod schema = single source of truth** for every Constraint 6/22/32/33/34/35 field.
4. **Deterministic `__STATE__`** computed in code, never by the LLM.
5. **Retry-with-error feedback**: Zod/constraint failures are appended to the
   conversation so the model sees exactly what it got wrong.

---

## Architecture

```
Browser UI ──► REST API ──► SQLite (Prisma) ──► In-process worker
                                                    │
                                                    ▼
                                          Pipeline orchestrator
                                          ├── PDF extract (pdftotext)
                                          ├── Structure detect (LLM → Zod)
                                          ├── Per-question loop:
                                          │     select target →
                                          │     build prompt →
                                          │     call LLM →
                                          │     validate (Zod + constraints) →
                                          │     retry with error →
                                          │     accept/reject
                                          ├── Compute __STATE__ (deterministic)
                                          ├── Assemble round file
                                          └── Write R{n}.json
                                                    │
                                          LLM provider abstraction
                                          (GLM-4.7-Flash default;
                                           OpenAI/Anthropic/Ollama swappable)
```

### Module map

| Path | Role |
|---|---|
| `src/lib/mcq-forge/spec/` | Zod schemas, enums, LaTeX checker, textbook-ref filter, cross-field constraints |
| `src/lib/mcq-forge/providers/` | `LLMProvider` interface + `GlmProvider` (z-ai-web-dev-sdk) + `MockProvider` |
| `src/lib/mcq-forge/pdf/` | `pdftotext` extraction + structure detection |
| `src/lib/mcq-forge/prompts/` | System / structure-detection / question-gen / retry prompts |
| `src/lib/mcq-forge/pipeline/` | Orchestrator, deterministic state, storage, in-process runner |
| `src/lib/mcq-forge/validator/` | Combined Zod + constraint + LaTeX validation entry point |
| `src/app/api/mcq/` | REST routes: upload, jobs, structure review, round fetch, ZIP download |
| `src/components/mcq-forge/` | Upload panel, structure review, live monitor, download panel |
| `prisma/schema.prisma` | `Job`, `RoundArtifact`, `JobEvent` models |

---

## Quick start (local)

```bash
# 1. Install deps
bun install

# 2. Configure environment
cp .env.example .env
#   edit .env: set ZAI_API_KEY=...

# 3. Create the SQLite database
bun run db:push

# 4. Start the dev server
bun run dev
```

Open the **Preview Panel** (this project runs in a sandbox; `localhost:3000` is
internal). Click **"Open in New Tab"** for a full-window view.

### Offline / no-quota mode

Set `MCQFORGE_PROVIDER=mock` in `.env` to run the entire pipeline with a
deterministic mock LLM — useful for UI walkthroughs and deployment smoke-tests
without spending API quota.

---

## Using mcq-forge

1. **Upload** a single-unit textbook PDF (e.g. `M9U1.pdf`).
2. Pick subject, grade, unit number, and round count (1–50; 6 ≈ 60 questions).
3. mcq-forge extracts the PDF text with `pdftotext` and asks GLM-4.7-Flash to
   detect the unit's hierarchical structure (sections, subsections,
   mini-headings, activities, key terms).
4. **Review the structure** in the UI. Edit if needed, then approve.
5. mcq-forge generates questions **one at a time**, validating each against the
   full spec before accepting it. Watch progress in the live log.
6. When done, **download the ZIP** and drop it into ExamPrep Studio.

Every generated `R{n}.json` is guaranteed to:
- parse as strict JSON,
- satisfy the Zod schema for `RoundFile` + all 10 `Question`s,
- pass the cross-field constraint checks (word counts by type, numeric/type-E
  consistency, visual-system nullness, publishing-metadata formatting),
- have LaTeX that is brace-balanced and delimiter-balanced,
- be free of textbook-reference / pedagogical-framing patterns in the stem.

---

## Configuration

All configuration is via environment variables (see `.env.example`):

| Var | Default | Purpose |
|---|---|---|
| `MCQFORGE_PROVIDER` | `glm` | `glm` (GLM-4.7-Flash) or `mock` (offline) |
| `ZAI_API_KEY` | — | Required for the `glm` provider |
| `MCQFORGE_GLM_MODEL` | `glm-4.7-flash` | Model name passed to the SDK |
| `DATABASE_URL` | `file:./db/custom.db` | SQLite path; switch to Postgres for Render |
| `MCQFORGE_MAX_ROUNDS` | `10` | Per-job round cap (spec hard limit is 50) |
| `MCQFORGE_CONCURRENCY` | `1` | Per-batch question concurrency (bump on paid plans) |

### Swapping LLM providers

The pipeline talks only to the `LLMProvider` interface
(`src/lib/mcq-forge/providers/types.ts`). To add a provider:

1. Implement `LLMProvider` in a new file (e.g. `providers/openai.ts`).
2. Register it in `providers/index.ts` `getProvider()` switch.
3. Set `MCQFORGE_PROVIDER=openai`.

The prompt templates, Zod schemas, and validation layer never change.

---

## Deploy to Render (free tier)

1. Push this repo to GitHub.
2. In Render: **New → Blueprint → select repo**. Render reads `render.yaml`.
3. In the Render dashboard, set the `ZAI_API_KEY` secret
   (`render.yaml` marks it `sync: false`).
4. Deploy. Render builds the `Dockerfile`, which installs `poppler-utils`
   (for `pdftotext`) and starts `bun run start` on port 3000.

### Persistence on free tier

Render free web services have **ephemeral filesystems**. SQLite, uploaded
PDFs, and generated outputs are lost on redeploy. Three options:

- **Trial / demo**: accept ephemeral storage (default).
- **Persistent**: attach a 1 GB disk (paid) — uncomment the `disk:` block in
  `render.yaml`. The Dockerfile mounts it at `/data`.
- **Production**: switch to a free Postgres (Neon / Supabase / Render Postgres
  free) by setting `DATABASE_URL` to the postgres URL and changing
  `prisma/schema.prisma` `datasource.provider` to `"postgresql"`, then run
  `bunx prisma db push`.

---

## API reference

| Method & path | Purpose |
|---|---|
| `POST /api/mcq/pdf` | Upload PDF + metadata; creates a job and starts PDF extraction |
| `GET  /api/mcq/jobs` | List recent jobs |
| `GET  /api/mcq/jobs/:id` | Job status + recent events + round artifacts |
| `DELETE /api/mcq/jobs/:id` | Cancel a running job |
| `GET  /api/mcq/jobs/:id/structure` | Get detected structure |
| `PUT  /api/mcq/jobs/:id/structure` | Approve (and optionally edit) structure; starts generation |
| `GET  /api/mcq/jobs/:id/rounds/:n` | Fetch `R{n}.json` |
| `GET  /api/mcq/jobs/:id/download` | Download all rounds as a ZIP (examprep-studio layout) |

---

## Cost & performance

- **Structure detection**: 1 LLM call per PDF (~6K output tokens), cached forever.
- **Per question**: 1 LLM call (~2K output tokens) + up to 3 retries with
  error feedback on validation failure.
- A full 10-round unit (~100 questions) typically takes 15–25 min on
  GLM-4.7-Flash and costs well under $1 at standard pricing.
- Token usage is recorded per job (`Job.inputTokens`, `outputTokens`,
  `totalTokens`) and shown in the UI.

---

## Fault tolerance

- **Per-question retry** (3 attempts) with Zod/constraint errors fed back to the LLM.
- **Per-batch rollback** (2 retries) with a fresh conversation if multiple questions fail.
- **Per-round checkpoint**: `__STATE__` is committed only after the round file
  is written to disk. A crash mid-round resumes from the previous round.
- **Resumable jobs**: the worker picks up any job left in `generating` status
  after a process restart.
- **Rate-limit handling**: exponential backoff with jitter on 429/5xx.
- **Cancellation**: `DELETE /api/mcq/jobs/:id` sets a flag the orchestrator
  checks between every question; completed rounds are preserved.

---

## License

MIT. See `LICENSE` if present.
