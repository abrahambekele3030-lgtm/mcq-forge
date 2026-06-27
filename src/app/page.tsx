'use client'

import * as React from 'react'
import { Upload, FileText, Sparkles, Loader2, CheckCircle2, AlertTriangle, Download, Plus, ChevronDown, ChevronRight, Zap, FileJson, ArrowRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { RJsonFile, EngineState, Question } from '@/lib/mcq-types'

// ===== Types =====
interface RoundResult {
  roundId: string
  questions: Question[]
  rawData: RJsonFile | null
  rawText: string
  state: EngineState | null
  repairMethod: string
  repairError: string | null
  timestamp: number
}

interface ConversationMsg {
  role: string
  content: string
}

// ===== Main Page =====
export default function Home() {
  const [step, setStep] = React.useState<'upload' | 'structure' | 'generating' | 'done'>('upload')
  const [pdfFile, setPdfFile] = React.useState<File | null>(null)
  const [pdfText, setPdfText] = React.useState<string>('')
  const [pdfFilename, setPdfFilename] = React.useState<string>('')
  const [grade, setGrade] = React.useState('Grade 9')
  const [subject, setSubject] = React.useState('Mathematics')
  const [unit, setUnit] = React.useState('')
  const [extracting, setExtracting] = React.useState(false)
  const [structure, setStructure] = React.useState<string>('')
  const [conversation, setConversation] = React.useState<ConversationMsg[]>([])
  const [rounds, setRounds] = React.useState<RoundResult[]>([])
  const [generating, setGenerating] = React.useState(false)
  const [exhausted, setExhausted] = React.useState(false)
  const [autoMode, setAutoMode] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const [currentState, setCurrentState] = React.useState<EngineState | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // ===== Step 1: Upload + Extract PDF =====
  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please upload a PDF file')
      return
    }
    setPdfFile(file)
    setPdfFilename(file.name)
    setExtracting(true)

    try {
      const formData = new FormData()
      formData.append('pdf', file)
      const res = await fetch('/api/extract-pdf', { method: 'POST', body: formData })

      // Robust response parsing — handle both JSON and HTML error responses
      const contentType = res.headers.get('content-type') || ''
      const rawText = await res.text()

      if (!res.ok || !contentType.includes('application/json')) {
        // Server returned an error (possibly HTML from gateway/proxy/compilation)
        let errorMsg = `Server returned ${res.status} ${res.statusText}`
        try {
          const errJson = JSON.parse(rawText)
          errorMsg = errJson.error || errorMsg
        } catch {
          // Response is HTML or plain text — extract useful message
          if (rawText.includes('<html') || rawText.includes('<!DOCTYPE')) {
            errorMsg = `Server error (${res.status}). The route may be compiling — please wait a moment and try again.`
          } else if (rawText.length > 0 && rawText.length < 500) {
            errorMsg = rawText
          }
        }
        throw new Error(errorMsg)
      }

      const data = JSON.parse(rawText)
      setPdfText(data.text)
      toast.success(`Extracted ${data.textLength.toLocaleString()} characters from ${data.pages} pages`)
      // Auto-detect unit from filename or first page
      if (!unit) {
        const firstPage = data.text.split('\f')[0]
        const unitMatch = firstPage.match(/UNIT\s+(.+)/i)
        if (unitMatch) setUnit(unitMatch[1].trim())
      }
    } catch (err) {
      toast.error(`PDF extraction failed: ${(err as Error).message}`)
      setPdfFile(null)
    } finally {
      setExtracting(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  // ===== Polling fetch helper — avoids gateway timeouts entirely =====
  // Instead of one long request (which times out at 30s), we:
  //   1. POST to start a background job → get jobId immediately
  //   2. Poll GET ?jobId=X every 2s until status is 'done' or 'error'
  // Each request is < 1s, so the gateway never times out.
  const [streamProgress, setStreamProgress] = React.useState<string>('')

  const pollingFetch = async (url: string, options: RequestInit): Promise<any> => {
    // Step 1: Start the job
    setStreamProgress('Starting LLM job…')
    const startRes = await fetch(url, options)
    const contentType = startRes.headers.get('content-type') || ''
    const startText = await startRes.text()

    if (!startRes.ok || !contentType.includes('application/json')) {
      let errorMsg = `Server returned ${startRes.status} ${startRes.statusText}`
      try {
        errorMsg = JSON.parse(startText).error || errorMsg
      } catch {
        if (startText.includes('<html') || startText.includes('<!DOCTYPE')) {
          errorMsg = `Server error (${startRes.status}). The route may be compiling — please wait and try again.`
        }
      }
      throw new Error(errorMsg)
    }

    const startData = JSON.parse(startText)
    if (startData.error) throw new Error(startData.error)
    if (!startData.jobId) throw new Error('Server did not return a job ID')

    const jobId = startData.jobId
    setStreamProgress('LLM is processing…')

    // Step 2: Poll for status every 2 seconds
    const pollInterval = 2000
    const maxWaitMs = 300000 // 5 minutes max
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, pollInterval))

      const pollRes = await fetch(`${url}?jobId=${encodeURIComponent(jobId)}`, { method: 'GET' })
      const pollContentType = pollRes.headers.get('content-type') || ''
      const pollText = await pollRes.text()

      if (!pollRes.ok || !pollContentType.includes('application/json')) {
        // Gateway error on poll — keep trying, the job might still be running
        setStreamProgress('Connection interrupted, retrying…')
        continue
      }

      let pollData: any
      try {
        pollData = JSON.parse(pollText)
      } catch {
        continue
      }

      if (pollData.status === 'done') {
        setStreamProgress('')
        return pollData.result
      } else if (pollData.status === 'error') {
        setStreamProgress('')
        throw new Error(pollData.error || 'LLM job failed')
      } else {
        // Still running — update progress
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        setStreamProgress(`${pollData.progress || 'LLM processing…'} (${elapsed}s)`)
      }
    }

    setStreamProgress('')
    throw new Error('LLM job timed out after 5 minutes')
  }

  // ===== Step 2: Start (ingest PDF + detect structure) =====
  const handleStart = async () => {
    if (!pdfText || !grade || !subject) {
      toast.error('Missing required fields')
      return
    }
    setStep('structure')
    setGenerating(true)

    try {
      const data = await pollingFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          pdfText,
          pdfFilename,
          grade,
          subject,
          unit: unit || 'Unit 1',
        }),
      })
      setStructure(data.response)
      setConversation(data.conversationHistory)
      toast.success('Structure detected — please verify')
    } catch (err) {
      toast.error(`Failed to start: ${(err as Error).message}`)
      setStep('upload')
    } finally {
      setGenerating(false)
    }
  }

  // ===== Step 2b: Verify structure =====
  const handleVerify = async () => {
    setGenerating(true)
    try {
      const data = await pollingFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          conversationHistory: conversation,
        }),
      })
      setConversation(data.conversationHistory)
      // Initialize the engine state for round 1
      setCurrentState({
        current_round: 1,
        last_question_id: '',
        covered_sections: [],
        used_question_signatures: [],
        baseline_counter: {},
        structure_verified: true,
        phase_status: { phase1_complete: false, phase2_complete: false, phase3_started: false },
        distribution_tracker: {},
        exhaustion_attempts: 0,
        concepts_mapped: {},
        baseline_complete: false,
        validation_hash: 'INITIAL',
        content_density_metrics: {
          total_concepts_extracted: 0,
          questions_per_concept_ratio: 0,
          structural_coverage_percentage: 0,
        },
      })
      setStep('generating')
      toast.success('Structure verified — ready to generate')
    } catch (err) {
      toast.error(`Verify failed: ${(err as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  // ===== Step 3: Generate next round (STATE-BASED — no conversation history needed) =====
  const handleNext = async (): Promise<boolean> => {
    if (generating || exhausted) return false
    setGenerating(true)

    try {
      // Use state-based approach: send structure + state + metadata (not conversation history)
      // This keeps each call at a fixed size regardless of round count
      const data = await pollingFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'next',
          structure,
          state: currentState,
          grade,
          subject,
          unit: unit || 'Unit 1',
          pdfFilename,
        }),
      })

      // Update the current state for the next round
      if (data.state) {
        setCurrentState(data.state)
      }

      const roundId = `R${String(rounds.length + 1).padStart(2, '0')}`
      const round: RoundResult = {
        roundId,
        questions: data.questions || [],
        rawData: data.repaired,
        rawText: data.response,
        state: data.state,
        repairMethod: data.repairMethod,
        repairError: data.repairError,
        timestamp: Date.now(),
      }
      setRounds((prev) => [...prev, round])

      if (data.isExhaustion) {
        setExhausted(true)
        setAutoMode(false)
        toast.success(`Exhaustion reached after ${rounds.length + 1} rounds (${(data.questions || []).length} questions in final batch)`)
      } else if (data.repairMethod === 'failed') {
        toast.error(`Round ${roundId}: JSON repair failed — check raw output`)
        setAutoMode(false)
        return false
      } else if (data.repairMethod !== 'strict') {
        toast.warning(`Round ${roundId}: repaired via ${data.repairMethod}`)
      } else {
        toast.success(`Round ${roundId}: ${data.questions?.length || 0} questions generated`)
      }

      if (data.isSafetyLimit) {
        setExhausted(true)
        setAutoMode(false)
        toast.info('Safety limit reached (500 questions)')
      }

      return !data.isExhaustion && !data.isSafetyLimit
    } catch (err) {
      toast.error(`Generation failed: ${(err as Error).message}`)
      setAutoMode(false)
      return false
    } finally {
      setGenerating(false)
    }
  }

  // ===== Auto-generate mode =====
  React.useEffect(() => {
    if (!autoMode || generating || exhausted) return
    let cancelled = false
    void (async () => {
      while (!cancelled && !exhausted) {
        const shouldContinue = await handleNext()
        if (!shouldContinue || cancelled) break
        // Small delay between rounds
        await new Promise((r) => setTimeout(r, 500))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode])

  // ===== Download =====
  const downloadRound = (round: RoundResult) => {
    const data = round.rawData || round.rawText
    const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${round.roundId}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${round.roundId}.json`)
  }

  const downloadAll = () => {
    rounds.forEach((round) => downloadRound(round))
  }

  const downloadAllAsZip = async () => {
    if (rounds.length === 0) return
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    rounds.forEach((round) => {
      const data = round.rawData || round.rawText
      const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      zip.file(`${round.roundId}.json`, content)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${subject}_${grade}_${unit || 'Unit1'}_rounds.zip`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${rounds.length} rounds as ZIP`)
  }

  // ===== Total questions =====
  const totalQuestions = rounds.reduce((sum, r) => sum + r.questions.length, 0)

  // ===== Render =====
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">MCQ Engine</span>
          <Badge variant="outline" className="ml-1 hidden sm:inline-flex">spec v9</Badge>
          <div className="ml-auto flex items-center gap-2">
            {rounds.length > 0 && (
              <>
                <Badge variant="secondary" className="gap-1">
                  <FileJson className="size-3" />
                  {rounds.length} rounds
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="size-3" />
                  {totalQuestions} questions
                </Badge>
                <Button size="sm" variant="outline" onClick={downloadAllAsZip} className="gap-1.5">
                  <Download className="size-4" />
                  <span className="hidden sm:inline">Download All</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 pb-24">
        {step === 'upload' && (
          <UploadStep
            pdfFile={pdfFile}
            pdfFilename={pdfFilename}
            grade={grade}
            subject={subject}
            unit={unit}
            extracting={extracting}
            dragOver={dragOver}
            fileInputRef={fileInputRef}
            onGradeChange={setGrade}
            onSubjectChange={setSubject}
            onUnitChange={setUnit}
            onFile={handleFile}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onFileInputClick={() => fileInputRef.current?.click()}
            onFileInputChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
            onStart={handleStart}
          />
        )}

        {step === 'structure' && (
          <StructureStep
            structure={structure}
            generating={generating}
            onVerify={handleVerify}
            onBack={() => setStep('upload')}
          />
        )}

        {(step === 'generating' || step === 'done') && (
          <GeneratingStep
            rounds={rounds}
            generating={generating}
            exhausted={exhausted}
            autoMode={autoMode}
            totalQuestions={totalQuestions}
            streamProgress={streamProgress}
            onGenerateNext={() => void handleNext()}
            onAutoToggle={() => setAutoMode((v) => !v)}
            onDownloadRound={downloadRound}
            onDownloadAll={downloadAllAsZip}
          />
        )}
      </main>

      <footer className="border-t bg-card/50 mt-auto">
        <div className="mx-auto max-w-6xl px-4 py-3 text-center text-xs text-muted-foreground">
          MCQ Engine · Powered by mcq_engine_spec_v9 · Automatic JSON repair with LaTeX escape fixing
        </div>
      </footer>
    </div>
  )
}

// ===== Upload Step =====
function UploadStep(props: {
  pdfFile: File | null
  pdfFilename: string
  grade: string
  subject: string
  unit: string
  extracting: boolean
  dragOver: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onGradeChange: (v: string) => void
  onSubjectChange: (v: string) => void
  onUnitChange: (v: string) => void
  onFile: (f: File) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onFileInputClick: () => void
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onStart: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-3">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">MCQ Generation Engine</h1>
        <p className="text-muted-foreground text-sm mt-1 max-w-xl mx-auto">
          Upload a textbook PDF — the engine detects structure, generates exam-quality MCQs in rounds,
          and outputs clean Rx.json files with automatic LaTeX escape repair.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Upload zone */}
        <Card className="p-5">
          <Label className="text-sm font-semibold mb-2 block">1. Upload Textbook PDF</Label>
          <div
            onDragOver={props.onDragOver}
            onDragLeave={props.onDragLeave}
            onDrop={props.onDrop}
            onClick={props.onFileInputClick}
            className={cn(
              'relative cursor-pointer rounded-xl border-2 border-dashed transition-all p-6 text-center',
              props.dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50',
            )}
          >
            <input
              ref={props.fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={props.onFileInputChange}
              className="sr-only"
            />
            {props.extracting ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Extracting text…</p>
              </div>
            ) : props.pdfFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-8 h-8 text-primary" />
                <p className="text-sm font-medium truncate max-w-full">{props.pdfFilename}</p>
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="size-3" /> Ready
                </Badge>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drop PDF here or click to browse</p>
                <p className="text-xs text-muted-foreground">One unit per PDF</p>
              </div>
            )}
          </div>
        </Card>

        {/* Metadata */}
        <Card className="p-5">
          <Label className="text-sm font-semibold mb-2 block">2. Specify Metadata</Label>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Grade</Label>
              <select
                value={props.grade}
                onChange={(e) => props.onGradeChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <select
                value={props.subject}
                onChange={(e) => props.onSubjectChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {['Mathematics', 'Physics', 'Chemistry', 'Biology'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Unit (auto-detected from PDF)</Label>
              <Input
                value={props.unit}
                onChange={(e) => props.onUnitChange(e.target.value)}
                placeholder="e.g. Unit 1: The Number System"
                className="h-10"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Start button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={props.onStart}
          disabled={!props.pdfFile || props.extracting}
          className="h-12 gap-2 min-w-[200px]"
        >
          <Sparkles className="size-5" />
          Start Engine
          <ArrowRight className="size-4" />
        </Button>
      </div>

      {/* Features */}
      <div className="grid sm:grid-cols-3 gap-3 mt-8">
        <Feature icon={<FileText className="size-4" />} title="PDF → Text" desc="Automatic extraction with pdftotext" />
        <Feature icon={<Zap className="size-4" />} title="Auto State Management" desc="__STATE__ carried between rounds automatically" />
        <Feature icon={<CheckCircle2 className="size-4" />} title="JSON Repair" desc="4-stage pipeline fixes LaTeX escape errors" />
      </div>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/50">
      <span className="text-primary mt-0.5">{icon}</span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  )
}

// ===== Structure Step =====
function StructureStep({ structure, generating, onVerify, onBack }: {
  structure: string
  generating: boolean
  onVerify: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          ← Back
        </Button>
        <h1 className="text-xl font-bold">Detected Structure</h1>
        {generating && <Loader2 className="size-5 animate-spin text-primary" />}
      </div>
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertTitle>Structure Detection Complete</AlertTitle>
        <AlertDescription>
          Review the detected structure below. If it looks correct, click "Verify & Start Generation".
          The engine will then generate 10 MCQs per round.
        </AlertDescription>
      </Alert>
      <Card className="p-4">
        <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-[50vh] overflow-y-auto">
          {structure || 'Waiting for response…'}
        </pre>
      </Card>
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button size="lg" onClick={onVerify} disabled={generating || !structure} className="gap-2 min-w-[240px]">
          {generating ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
          Verify & Start Generation
        </Button>
      </div>
    </div>
  )
}

// ===== Generating Step =====
function GeneratingStep({ rounds, generating, exhausted, autoMode, totalQuestions, streamProgress, onGenerateNext, onAutoToggle, onDownloadRound, onDownloadAll }: {
  rounds: RoundResult[]
  generating: boolean
  exhausted: boolean
  autoMode: boolean
  totalQuestions: number
  streamProgress: string
  onGenerateNext: () => void
  onAutoToggle: () => void
  onDownloadRound: (r: RoundResult) => void
  onDownloadAll: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Rounds" value={rounds.length} icon={<FileJson className="size-4" />} />
        <StatCard label="Questions" value={totalQuestions} icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Status" value={exhausted ? 'Exhausted' : generating ? 'Generating…' : 'Ready'} icon={generating ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} />
        <StatCard label="Repair Rate" value={`${rounds.filter(r => r.repairMethod === 'strict').length}/${rounds.length}`} icon={<CheckCircle2 className="size-4" />} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onGenerateNext} disabled={generating || exhausted} className="gap-2">
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Generate Next Round
        </Button>
        <Button
          variant={autoMode ? 'destructive' : 'secondary'}
          onClick={onAutoToggle}
          disabled={exhausted}
          className="gap-2"
        >
          {autoMode ? <><Loader2 className="size-4 animate-spin" /> Stop Auto</> : <><Zap className="size-4" /> Auto-Generate All</>}
        </Button>
        {rounds.length > 0 && (
          <Button variant="outline" onClick={onDownloadAll} className="gap-2 ml-auto">
            <Download className="size-4" /> Download All (ZIP)
          </Button>
        )}
      </div>

      {exhausted && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Generation Complete</AlertTitle>
          <AlertDescription>
            The engine has reached exhaustion or safety limit. {totalQuestions} questions generated across {rounds.length} rounds.
          </AlertDescription>
        </Alert>
      )}

      {/* Round cards */}
      <div className="space-y-3">
        {rounds.map((round, idx) => (
          <RoundCard key={idx} round={round} onDownload={() => onDownloadRound(round)} />
        ))}
      </div>

      {/* Loading placeholder */}
      {generating && (
        <Card className="p-6 border-dashed">
          <div className="flex items-center gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Generating round R{String(rounds.length + 1).padStart(2, '0')}…</p>
              <p className="text-xs text-muted-foreground">
                {streamProgress || 'The LLM is producing 3 MCQs with full constraint validation'}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </Card>
  )
}

// ===== Round Card =====
function RoundCard({ round, onDownload }: { round: RoundResult; onDownload: () => void }) {
  const [expanded, setExpanded] = React.useState(false)
  const repairColor = round.repairMethod === 'strict' ? 'text-emerald-600' : round.repairMethod === 'failed' ? 'text-rose-600' : 'text-amber-600'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1 text-left">
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <FileJson className="size-4 text-primary" />
            <span className="font-semibold">{round.roundId}.json</span>
            <Badge variant="outline" className="ml-1">{round.questions.length} Q</Badge>
            <Badge variant="outline" className={cn('text-xs', repairColor)}>
              {round.repairMethod}
            </Badge>
            {round.repairError && (
              <Badge variant="destructive" className="text-xs">error</Badge>
            )}
          </button>
          <Button size="sm" variant="ghost" onClick={onDownload} className="gap-1.5 h-8">
            <Download className="size-3.5" /> Download
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {round.repairError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="size-4" />
              <AlertDescription>{round.repairError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {round.questions.map((q, i) => (
              <QuestionPreview key={i} q={q} index={i} />
            ))}
          </div>
          {/* Raw JSON toggle */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-2 gap-1 text-xs">
                <FileText className="size-3" /> View raw JSON
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md max-h-[30vh] overflow-auto mt-2">
                {JSON.stringify(round.rawData || round.rawText, null, 2).slice(0, 5000)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      )}
    </Card>
  )
}

function QuestionPreview({ q, index }: { q: Question; index: number }) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-xs text-muted-foreground">Q{index + 1}</span>
        <Badge variant="outline" className="text-xs">{q.mcq_type}</Badge>
        <Badge variant="outline" className="text-xs">{q.difficulty_level}</Badge>
        <span className="ml-auto font-mono text-xs text-muted-foreground">{q.question_id}</span>
      </div>
      <p className="font-medium mb-2">{q.question}</p>
      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        {['A', 'B', 'C', 'D'].map((letter) => (
          <span key={letter} className={cn('truncate', q.correct_answer === letter && 'text-emerald-600 font-medium')}>
            {letter}) {q.options?.[letter] || '—'}
          </span>
        ))}
      </div>
    </div>
  )
}
