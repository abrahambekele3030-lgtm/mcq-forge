'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, GitBranch, BookOpen, ListTree } from 'lucide-react'
import { toast } from 'sonner'
import { ScrollArea } from '@/components/ui/scroll-area'

interface StructureElement {
  kind: string
  number: string | null
  title: string
  page_start: number | null
  page_end: number | null
  parent_path: string[]
  concepts: string[]
}
interface Structure {
  unit_title: string
  grade: string
  subject: string
  unit_number: number
  elements: StructureElement[]
  total_counts: {
    sections: number
    subsections: number
    sub_subsections: number
    mini_headings: number
    activities_exercises: number
    key_terms: number
  }
  pdf_filename: string
  pdf_page_count: number
}

const KIND_COLORS: Record<string, string> = {
  section: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  subsection: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  sub_subsection: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  mini_heading: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  activity: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  worked_example: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300',
  exercise: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  key_term: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  review_question: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  unit_outcome: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  project: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  summary: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
}

export function StructureReview({ jobId, onApproved }: { jobId: string; onApproved: () => void }) {
  const [structure, setStructure] = useState<Structure | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/mcq/jobs/${jobId}/structure`, { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && data.structure) {
          setStructure(data.structure)
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 3000)
    return () => { cancelled = true; clearInterval(t) }
  }, [jobId])

  const approve = async () => {
    setApproving(true)
    try {
      const res = await fetch(`/api/mcq/jobs/${jobId}/structure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structure }),
      })
      if (!res.ok) throw new Error('Approval failed')
      toast.success('Structure approved. Generation starting…')
      onApproved()
    } catch {
      toast.error('Failed to approve structure')
    } finally {
      setApproving(false)
    }
  }

  if (loading || !structure) {
    return (
      <Card>
        <CardContent className="py-16 flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-amber-600" />
          <p className="text-sm text-muted-foreground">Loading detected structure…</p>
        </CardContent>
      </Card>
    )
  }

  // Build a hierarchical view
  const roots = structure.elements.filter((e) => e.parent_path.length === 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-amber-600" />
            Detected structure
          </CardTitle>
          <CardDescription>
            Review the structure below. Once approved, mcq-forge will generate questions
            mapped to these exact elements — every question&apos;s <code className="text-xs">source_trace</code>
            will reference one of them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted/40 p-4 space-y-1">
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 className="text-lg font-bold">{structure.unit_title}</h3>
              <span className="text-xs text-muted-foreground">
                {structure.subject} · {structure.grade} · Unit {structure.unit_number}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {structure.pdf_filename} · {structure.pdf_page_count} pages
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
            <Stat label="Sections" value={structure.total_counts.sections} />
            <Stat label="Subsections" value={structure.total_counts.subsections} />
            <Stat label="Sub-sub" value={structure.total_counts.sub_subsections} />
            <Stat label="Mini-headings" value={structure.total_counts.mini_headings} />
            <Stat label="Activities" value={structure.total_counts.activities_exercises} />
            <Stat label="Key terms" value={structure.total_counts.key_terms} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTree className="size-4" /> Hierarchy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[420px] pr-3">
            <div className="space-y-1">
              {roots.map((el) => (
                <ElementTree key={el.title + el.number} elements={structure.elements} element={el} depth={0} />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-4">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <span>Structure looks correct? Approve to begin generation.</span>
        </div>
        <Button
          onClick={approve}
          disabled={approving}
          className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
        >
          {approving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <CheckCircle2 className="size-4 mr-2" />}
          Approve &amp; generate
        </Button>
      </div>
    </div>
  )
}

function ElementTree({
  elements, element, depth,
}: { elements: StructureElement[]; element: StructureElement; depth: number }) {
  const children = elements.filter(
    (e) => e.parent_path[e.parent_path.length - 1] === element.title &&
           e.parent_path.length === (element.parent_path.length + 1) &&
           e.title !== element.title,
  )
  return (
    <div>
      <div
        className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-accent/50 transition"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {element.number ? (
          <span className="text-xs font-mono text-muted-foreground mt-0.5 min-w-[2.5rem]">{element.number}</span>
        ) : (
          <GitBranch className="size-3 text-muted-foreground mt-1 min-w-[2.5rem]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{element.title}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${KIND_COLORS[element.kind] ?? ''}`}>
              {element.kind}
            </Badge>
            {element.page_start != null && (
              <span className="text-[10px] text-muted-foreground">p.{element.page_start}{element.page_end !== element.page_start ? `–${element.page_end}` : ''}</span>
            )}
          </div>
          {element.concepts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {element.concepts.slice(0, 6).map((c) => (
                <span key={c} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{c}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {children.map((c) => (
        <ElementTree key={c.title + c.number + c.kind} elements={elements} element={c} depth={depth + 1} />
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  )
}
