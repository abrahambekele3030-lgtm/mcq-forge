# mcq-forge — quick start

This ZIP is a clean, deployable copy of the mcq-forge project.
It is ready to push to GitHub and deploy on Render.

## 1. Run locally

```bash
bun install               # or: npm install
cp .env.example .env      # then edit .env (see below)
bun run db:push           # create the SQLite database
bun run dev               # start the dev server on :3000
```

### Environment variables (.env)

```bash
MCQFORGE_PROVIDER=glm     # "glm" for GLM-4.7-Flash, or "mock" for offline testing
ZAI_API_KEY=your-key      # required when MCQFORGE_PROVIDER=glm
DATABASE_URL="file:./db/custom.db"
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

### Option A — Docker (recommended)

1. In Render: **New → Web Service → connect your GitHub repo**.
2. Choose **Docker** as the environment.
3. Render reads the included `Dockerfile`, which installs poppler-utils
   (for pdftotext) and runs `bun run build` then `bun run start`.
4. Add environment variables in Render's dashboard:
   - `ZAI_API_KEY` = your GLM API key
   - `MCQFORGE_PROVIDER` = `glm`
5. Deploy.

### Option B — Blueprint

1. In Render: **New → Blueprint → connect your repo**.
2. Render reads the included `render.yaml`.
3. Set `ZAI_API_KEY` as a secret in the dashboard.
4. Deploy.

See README.md for full architecture and API docs.
