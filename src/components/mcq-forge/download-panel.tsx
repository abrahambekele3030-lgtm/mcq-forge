'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, FileJson, Package, Eye, Loader2, CheckCircle2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface RoundArtifact {
  round: number
  roundId: string
  questionCount: number
  jsonSize: number
  filePath: string
}

interface Job {
  id: string
  status: string
  totalQuestions: number
  exhausted: boolean
  safetyLimit: boolean
  grade: string
  subject: string
  unitNumber: number
}

interface JobDetail extends Job {
  rounds: RoundArtifact[]
}

export function DownloadPanel({ jobId }: { jobId: string; job: Job }) {
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const [previewRound, setPreviewRound] = useState<number | null>(null)
  const [previewData, setPreviewData] = useState<unknown>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/mcq/jobs/${jobId}`, { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled) setDetail(data.job)
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [jobId])

  const downloadZip = () => {
    window.location.href = `/api/mcq/jobs/${jobId}/download`
  }

  const downloadRound = async (round: number) => {
    window.location.href = `/api/mcq/jobs/${jobId}/rounds/${round}`
  }

  const preview = async (round: number) => {
    setPreviewRound(round)
    setLoadingPreview(true)
    setPreviewData(null)
    try {
      const res = await fetch(`/api/mcq/jobs/${jobId}/rounds/${round}`, { cache: 'no-store' })
      const data = await res.json()
      setPreviewData(data)
    } catch {
      toast.error('Failed to load round preview')
    } finally {
      setLoadingPreview(false)
    }
  }

  const rounds = detail?.rounds ?? []
  const totalSize = rounds.reduce((a, r) => a + (r.jsonSize ?? 0), 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" /> Generation complete
          </CardTitle>
          <CardDescription>
            {rounds.length} round file{rounds.length === 1 ? '' : 's'} generated · {detail?.totalQuestions ?? 0} questions · {(totalSize / 1024).toFixed(1)} KB total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={downloadZip}
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
            >
              <Package className="size-4 mr-2" /> Download ZIP (examprep-studio layout)
            </Button>
            {detail?.exhausted && <Badge variant="outline">structural exhaustion reached</Badge>}
            {detail?.safetyLimit && <Badge variant="destructive">50-round safety limit</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            The ZIP contains <code>data/&lt;Subject&gt;/&lt;Grade_X&gt;/&lt;Unit_Y&gt;/Rn.json</code> —
            drag-and-drop it directly into ExamPrep Studio. Every file is strict-JSON validated.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Round files</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[460px] pr-3">
            <div className="space-y-1.5">
              {rounds.map((r) => (
                <div
                  key={r.round}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-accent/40 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                      <FileJson className="size-4 text-amber-700 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium">R{String(r.round).padStart(2, '0')}.json</p>
                      <p className="text-xs text-muted-foreground">
                        {r.questionCount} questions · {(r.jsonSize / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => preview(r.round)}>
                      <Eye className="size-3.5 mr-1" /> Preview
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => downloadRound(r.round)}>
                      <Download className="size-3.5 mr-1" /> JSON
                    </Button>
                  </div>
                </div>
              ))}
              {rounds.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No round files yet.</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={previewRound !== null} onOpenChange={(o) => !o && setPreviewRound(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>R{String(previewRound ?? 0).padStart(2, '0')}.json preview</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            {loadingPreview ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : previewData ? (
              <pre className="text-xs font-mono leading-relaxed bg-muted/40 rounded p-3">
                {JSON.stringify(previewData, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
