'use client'

/**
 * mcq-forge — main page
 *
 * Single-route application (per project rules: only / is user-visible).
 * State machine driven by the active job's status:
 *   no job              -> UploadPanel
 *   detecting_structure  -> Loader ("analyzing PDF…")
 *   awaiting_structure_review -> StructureReview
 *   generating           -> JobMonitor (live progress)
 *   completed            -> DownloadPanel + RoundViewer
 *   failed / cancelled   -> error card + retry
 */
import { useCallback, useEffect, useState } from 'react'
import { UploadPanel } from '@/components/mcq-forge/upload-panel'
import { StructureReview } from '@/components/mcq-forge/structure-review'
import { JobMonitor } from '@/components/mcq-forge/job-monitor'
import { DownloadPanel } from '@/components/mcq-forge/download-panel'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileWarning, Plus, Anvil, Github, Download } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'

interface JobSummary {
  id: string
  status: string
  grade: string
  subject: string
  unitNumber: number
  pdfFilename: string
  currentRound: number
  totalRounds: number
  totalQuestions: number
  progress: number
  errorMessage: string | null
  exhausted: boolean
  safetyLimit: boolean
  structureApproved: boolean
  createdAt: string
  _count?: { rounds: number }
}

export default function Page() {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/mcq/jobs', { cache: 'no-store' })
      const data = await res.json()
      setJobs(data.jobs ?? [])
      if (!activeJobId && (data.jobs ?? []).length > 0) {
        setActiveJobId(data.jobs[0].id)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [activeJobId])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [refresh])

  const active = jobs.find((j) => j.id === activeJobId) ?? null

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <Toaster richColors position="top-right" />
      <header className="border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm">
              <Anvil className="size-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">mcq-forge</h1>
              <p className="text-xs text-muted-foreground leading-none mt-1">
                Spec-v9 compliant MCQ generation engine
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              GLM-4.7-Flash
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                toast.promise(
                  fetch('/api/mcq/source').then((r) => {
                    if (!r.ok) throw new Error('Download failed')
                    return r.blob()
                  }).then((blob) => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'mcq-forge.zip'
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(url)
                  }),
                  { loading: 'Bundling source…', success: 'mcq-forge.zip downloaded', error: 'Download failed' },
                )
              }}
            >
              <Download className="size-4 mr-1" /> Source
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveJobId(null)
                toast.info('Start a new generation job below.')
              }}
            >
              <Plus className="size-4 mr-1" /> New
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-6xl px-4 py-8">
        {!active && <UploadPanel onCreated={(j) => { setActiveJobId(j.id); refresh() }} />}

        {active && (
          <div className="space-y-6">
            <JobHeader job={active} />
            <JobContentView job={active} onRefresh={refresh} onReset={() => setActiveJobId(null)} />
          </div>
        )}

        {jobs.length > 1 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-base">Recent jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {jobs.filter((j) => j.id !== active?.id).slice(0, 8).map((j) => (
                <button
                  key={j.id}
                  onClick={() => setActiveJobId(j.id)}
                  className="w-full text-left flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {j.subject} · {j.grade} · Unit {j.unitNumber}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{j.pdfFilename}</p>
                  </div>
                  <StatusBadge status={j.status} />
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t mt-auto">
        <div className="container mx-auto max-w-6xl px-4 py-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>mcq-forge · automated spec-v9 MCQ generation</span>
          <a
            href="https://github.com"
            className="inline-flex items-center gap-1 hover:text-foreground transition"
            target="_blank"
            rel="noreferrer"
          >
            <Github className="size-3.5" /> Source
          </a>
        </div>
      </footer>
    </div>
  )
}

function JobHeader({ job }: { job: JobSummary }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          {job.subject} · {job.grade} · Unit {job.unitNumber}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {job.pdfFilename} · job {job.id.slice(-8)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={job.status} />
        {job.totalQuestions > 0 && (
          <Badge variant="secondary">{job.totalQuestions} questions</Badge>
        )}
        {job.exhausted && <Badge variant="outline">exhausted</Badge>}
        {job.safetyLimit && <Badge variant="destructive">safety limit</Badge>}
      </div>
    </div>
  )
}

function JobContentView({
  job, onRefresh, onReset,
}: {
  job: JobSummary
  onRefresh: () => void
  onReset: () => void
}) {
  if (['queued', 'extracting', 'detecting_structure'].includes(job.status)) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-amber-600" />
          <p className="text-sm text-muted-foreground">
            {job.status === 'extracting' ? 'Extracting PDF text…' :
             job.status === 'detecting_structure' ? 'Asking GLM-4.7-Flash to detect unit structure…' :
             'Queued…'}
          </p>
        </CardContent>
      </Card>
    )
  }
  if (job.status === 'awaiting_structure_review') {
    return <StructureReview jobId={job.id} onApproved={() => onRefresh()} />
  }
  if (job.status === 'generating') {
    return <JobMonitor jobId={job.id} job={job} />
  }
  if (job.status === 'failed') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileWarning className="size-5 text-destructive" /> Generation failed
          </CardTitle>
          <CardDescription>The pipeline encountered an unrecoverable error.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="text-xs bg-destructive/5 border border-destructive/20 rounded p-3 overflow-auto max-h-48">
            {job.errorMessage || 'Unknown error'}
          </pre>
          <Button variant="outline" onClick={onReset}>Start a new job</Button>
        </CardContent>
      </Card>
    )
  }
  if (['completed', 'cancelled'].includes(job.status)) {
    return <DownloadPanel jobId={job.id} job={job} />
  }
  return null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    queued: { label: 'queued', variant: 'outline' },
    extracting: { label: 'extracting', variant: 'secondary' },
    detecting_structure: { label: 'detecting', variant: 'secondary' },
    awaiting_structure_review: { label: 'review structure', variant: 'default' },
    generating: { label: 'generating', variant: 'default' },
    completed: { label: 'completed', variant: 'default' },
    failed: { label: 'failed', variant: 'destructive' },
    cancelled: { label: 'cancelled', variant: 'outline' },
  }
  const m = map[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={m.variant}>{m.label}</Badge>
}
