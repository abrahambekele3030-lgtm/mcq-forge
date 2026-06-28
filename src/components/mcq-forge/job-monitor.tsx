'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Loader2, X, Terminal, CheckCircle2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

interface JobEvent {
  id: string
  type: string
  payload: string | null
  createdAt: string
}
interface RoundArtifact {
  round: number
  roundId: string
  questionCount: number
  jsonSize: number
}
interface JobDetail {
  id: string
  status: string
  currentRound: number
  totalRounds: number
  totalQuestions: number
  progress: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  rounds: RoundArtifact[]
  events: JobEvent[]
}

export function JobMonitor({ jobId }: { jobId: string; job: unknown }) {
  const [job, setJob] = useState<JobDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/mcq/jobs/${jobId}`, { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled) setJob(data.job)
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [jobId])

  const cancel = async () => {
    if (!confirm('Cancel this job? Completed rounds will be preserved.')) return
    try {
      await fetch(`/api/mcq/jobs/${jobId}`, { method: 'DELETE' })
      toast.info('Cancellation requested')
    } catch {
      toast.error('Failed to cancel')
    }
  }

  if (!job) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-amber-600" />
        </CardContent>
      </Card>
    )
  }

  const progressPct = Math.round((job.progress ?? 0) * 100)
  const events = job.events ?? []
  const rounds = job.rounds ?? []

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Progress card */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Overall</span>
              <span className="font-medium tabular-nums">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Round" value={`${job.currentRound ?? 0} / ${job.totalRounds ?? '?'}`} />
            <Metric label="Questions" value={String(job.totalQuestions ?? 0)} />
            <Metric label="Input tokens" value={fmt(job.inputTokens)} />
            <Metric label="Output tokens" value={fmt(job.outputTokens)} />
            <Metric label="Total tokens" value={fmt(job.totalTokens)} />
            <Metric label="Rounds saved" value={String(rounds.length)} />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={cancel}>
            <X className="size-4 mr-2" /> Cancel job
          </Button>
        </CardContent>
      </Card>

      {/* Rounds card */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">Rounds</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-3">
            <div className="space-y-1.5">
              {Array.from({ length: job.totalRounds ?? 0 }, (_, i) => i + 1).map((n) => {
                const artifact = rounds.find((r) => r.round === n)
                const inProgress = job.currentRound === n && !artifact
                return (
                  <div
                    key={n}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs">R{String(n).padStart(2, '0')}</span>
                    {artifact ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {artifact.questionCount} Q
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{(artifact.jsonSize / 1024).toFixed(1)} KB</span>
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                      </div>
                    ) : inProgress ? (
                      <Badge variant="default" className="text-[10px]">
                        <Loader2 className="size-3 mr-1 animate-spin" /> generating
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">pending</span>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Event log */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="size-4" /> Live log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-3">
            <div className="space-y-1 font-mono text-[11px]">
              {events.length === 0 && (
                <p className="text-muted-foreground italic">Waiting for events…</p>
              )}
              {events.map((e) => {
                const p = e.payload ? JSON.parse(e.payload) : {}
                return (
                  <div key={e.id} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(e.createdAt).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span className={
                      e.type === 'question_ok' ? 'text-emerald-600 dark:text-emerald-400' :
                      e.type === 'question_fail' || e.type === 'round_fail' ? 'text-destructive' :
                      e.type === 'round_complete' ? 'text-blue-600 dark:text-blue-400' :
                      'text-foreground'
                    }>
                      {formatEvent(e.type, p)}
                    </span>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function fmt(n: number): string {
  if (!n) return '0'
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

function formatEvent(type: string, p: Record<string, unknown>): string {
  switch (type) {
    case 'round_start': return `▶ round ${p.round} started`
    case 'question_start': return `  ? Q${typeof p.index === 'number' ? p.index + 1 : '?'} (${p.mcqType}) ${p.element ?? ''}`
    case 'question_retry': return `  ↻ retry ${p.attempt} — ${(p.errors as string[] | undefined)?.slice(0, 1).join('') ?? ''}`
    case 'question_ok': return `  ✓ ${p.questionId} (${p.latencyMs}ms, ${p.tokens} tok)`
    case 'question_fail': return `  ✗ Q${typeof p.index === 'number' ? p.index + 1 : '?'} failed: ${p.error ?? ''}`
    case 'round_complete': return `✓ round ${p.round} complete (${p.latencyMs}ms, ${p.questions} Q)`
    case 'round_fail': return `✗ round ${p.round} failed: ${p.error ?? ''}`
    case 'exhaustion': return `◆ exhaustion at round ${p.round}: ${p.proof ?? ''}`
    case 'safety_limit': return `◆ safety limit reached at round ${p.round}`
    case 'stopped': return `■ stopped at round ${p.round}`
    case 'complete': return `■ complete — ${p.totalRounds} rounds, ${p.totalQuestions} questions`
    default: return type
  }
}
