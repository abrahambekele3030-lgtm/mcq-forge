# mcq-forge — quick start

This ZIP is a clean, deployable copy of the mcq-forge project.
It is ready to push to GitHub and deploy on Render.

## 1. Run locally

```bash
bun install               # or: npm install
cp .env.example .env      # then edit .env (see below)
bun run db:push           # create the PostgreSQL tables
bun run dev               # start the dev server on :3000
```

### Environment variables (.env)

The schema uses **PostgreSQL**. Set DATABASE_URL to your Postgres connection
string (free options: Neon at neon.tech, Supabase, or Render Postgres):

```bash
MCQFORGE_PROVIDER=glm     # "glm" for GLM-4.7-Flash, or "mock" for offline testing
ZAI_API_KEY=your-key      # required when MCQFORGE_PROVIDER=glm
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "mcq-forge: automated spec-v9 MCQ generation"
git branch -M main
git remote add origin https://github.com/<you>/mcq-forge.git
git push -u origin main
```

## 3. Deploy on Render (free tier)

### Option A — Blueprint (recommended)

1. In Render: **New → Blueprint → connect your repo**.
2. Render reads the included `render.yaml`, which creates:
   - a free PostgreSQL database (`mcq-forge-db`),
   - the web service, wired to that database via DATABASE_URL.
3. Set `ZAI_API_KEY` as a secret in the dashboard.
4. Deploy. The Dockerfile runs `prisma db push` on startup to create tables.

### Option B — Manual Docker

1. Create a PostgreSQL database on Render (or Neon/Supabase).
2. In Render: **New → Web Service → connect your GitHub repo** → Docker.
3. Add environment variables:
   - `DATABASE_URL` = your Postgres connection string
   - `ZAI_API_KEY` = your GLM API key
   - `MCQFORGE_PROVIDER` = `glm`
4. Deploy.

See README.md for full architecture and API docs.
