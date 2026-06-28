'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Loader2, FileText, CheckCircle2, AlertCircle, Download } from 'lucide-react'
import { toast } from 'sonner'

interface CreatedJob { id: string }

const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Geography', 'Civics']
const GRADES = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)

export function UploadPanel({ onCreated }: { onCreated: (job: CreatedJob) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [grade, setGrade] = useState('Grade 9')
  const [subject, setSubject] = useState('Mathematics')
  const [unitNumber, setUnitNumber] = useState('1')
  const [totalRounds, setTotalRounds] = useState('6')
  const [submitting, setSubmitting] = useState(false)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f && f.name.toLowerCase().endsWith('.pdf')) {
      setFile(f)
    } else {
      toast.error('Please drop a PDF file')
    }
  }, [])

  const submit = async () => {
    if (!file) { toast.error('Choose a PDF first'); return }
    setSubmitting(true)
    const form = new FormData()
    form.append('file', file)
    form.append('grade', grade)
    form.append('subject', subject)
    form.append('unitNumber', unitNumber)
    form.append('totalRounds', totalRounds)
    try {
      const res = await fetch('/api/mcq/pdf', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(err.error)
      }
      const { job } = await res.json()
      toast.success('Job created. Analyzing PDF…')
      onCreated(job)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5 text-amber-600" /> Upload a textbook PDF
          </CardTitle>
          <CardDescription>
            mcq-forge will analyze the PDF, detect its structure, then generate
            spec-v9 compliant <code className="text-xs">R1.json … Rn.json</code> files
            using GLM-4.7-Flash — one validated question at a time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => document.getElementById('pdf-input')?.click()}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
          >
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="size-8 text-emerald-600" />
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <FileText className="size-8 text-muted-foreground" />
                <p className="font-medium">Drop a PDF here, or click to browse</p>
                <p className="text-xs text-muted-foreground">Single unit / chapter per PDF</p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Grade</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unit number</Label>
              <Input type="number" min={1} max={20} value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rounds (1–50)</Label>
              <Input type="number" min={1} max={50} value={totalRounds} onChange={(e) => setTotalRounds(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="size-3.5" />
            Each round = 10 questions. 6 rounds ≈ 60 questions, ~15–25 min on GLM-4.7-Flash.
          </div>

          <Button
            onClick={submit}
            disabled={!file || submitting}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
          >
            {submitting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Upload className="size-4 mr-2" />}
            {submitting ? 'Uploading…' : 'Upload & analyze PDF'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4">
        <FeatureCard
          title="Spec-v9 compliant"
          body="Every question is validated against the full Zod schema + 35 constraints before it is written to disk."
        />
        <FeatureCard
          title="No more corruption"
          body="Per-question generation, JSON-only output, and retry-with-error kill the 46% corruption rate of the legacy dataset."
        />
        <FeatureCard
          title="Deterministic state"
          body="__STATE__ is computed in code, never by the LLM. Same PDF + seed → byte-identical files."
        />
      </div>

      <Card className="border-2 border-amber-500/40 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="size-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 shadow-md">
                <Download className="size-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base">Download the project source</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-lg">
                  Get a clean, deployable ZIP. Push it to GitHub and deploy on Render
                  in minutes — includes Dockerfile, render.yaml, .env.example, and
                  full source. No sandbox cruft, no secrets.
                </p>
              </div>
            </div>
            <Button
              size="lg"
              className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-md"
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
              <Download className="size-4 mr-2" /> Download ZIP
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t border-amber-500/20 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-600" /> Git-ready</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-600" /> Render Blueprint</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-600" /> Dockerfile included</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-600" /> No secrets bundled</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <h3 className="font-semibold text-sm mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  )
}
