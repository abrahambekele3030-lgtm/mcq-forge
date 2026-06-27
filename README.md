# MCQ Forge

Automatic MCQ (Multiple Choice Question) generator from textbook PDFs. Upload a PDF, and the engine generates exam-quality questions in rounds — with LaTeX math support, stateful coverage tracking, and automatic JSON repair.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **PDF → MCQs** — Upload a textbook PDF, get exam-quality multiple choice questions
- **Stateful rounds** — `__STATE__` tracks covered sections, used signatures, and baseline coverage
- **LaTeX math support** — Questions can include `\frac{a}{b}`, `\tau = mgd`, etc.
- **Automatic JSON repair** — 4-stage pipeline fixes LaTeX escape errors
- **Auto-generate mode** — One click generates all rounds until exhaustion
- **Download** — Individual `R1.json`, `R2.json`... or all as ZIP

## Quick Start

### 1. Get a FREE Z.AI API Key

1. Go to **[https://z.ai](https://z.ai)** or **[https://open.bigmodel.cn](https://open.bigmodel.cn)**
2. Sign up (free — new users get free credits)
3. Go to **API Keys** → **Create API Key**
4. Copy your key

### 2. Install & Run

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add your ZAI_API_KEY

# Run the dev server
npm run dev

# Open http://localhost:3000
```

## Deployment

### Render (Recommended — free tier supports long LLM calls)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Select your repo (Render reads `render.yaml` automatically)
4. Add environment variable: `ZAI_API_KEY`
5. Deploy

**System dependency:** The app needs `pdftotext` (Poppler) for PDF extraction.
On Render, add this to the build command:
```
apt-get update && apt-get install -y poppler-utils && npm install && npm run build
```

### Vercel (Also free)

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → Add New Project → import repo
3. Add environment variable: `ZAI_API_KEY`
4. Deploy

**Note:** Vercel's free tier has a 10s function timeout. The app uses polling (each request < 1s), but the in-memory job store may not persist between serverless invocations. For reliable long LLM calls, use Render.

## How the API Key Works

The `z-ai-web-dev-sdk` reads from a `.z-ai-config` JSON file. The `src/lib/zai-config.ts` helper automatically creates this file from the `ZAI_API_KEY` environment variable at runtime — so you just set the env var on Render/Vercel and it works.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **AI**: Z-AI Web Dev SDK (GLM-4.6)
- **PDF extraction**: pdftotext (Poppler)

## License

MIT
