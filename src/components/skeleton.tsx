import type { ComponentChildren } from "preact"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"

// Skeletons stand in for the real content while it loads, in the content's own shape: a
// rupiah figure is a right-aligned block as wide as a figure, a table is rows, a tile is a
// label over a number. Nothing here shimmers across; the blocks breathe in place (see
// index.css, `skeleton-breathe`), and with reduced motion they hold still. Every skeleton
// is wrapped in <Loading>, which names itself to screen readers and holds back 150ms so a
// fast load never flashes.

export function Skeleton({ className, style }: { className?: string; style?: Record<string, string> }) {
  return <span aria-hidden style={style} className={cn("skeleton block rounded-sm bg-muted", className)} />
}

// Loading wraps a page's skeleton: one status for assistive tech, the shapes hidden from it.
export function Loading({ children, className }: { children: ComponentChildren; className?: string }) {
  const t = useT()
  return (
    <div role="status" aria-label={t("common.loading")} className={cn("skeleton-in grid gap-6", className)}>
      {children}
    </div>
  )
}

// SkeletonText: lines of running text. Widths vary like a real paragraph's last line does.
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3"]
  return (
    <span className={cn("grid gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn("h-3.5", widths[i === lines - 1 ? 3 : i % 3])} />)}
    </span>
  )
}

// SkeletonAmount: the width of a rupiah figure, right-aligned like the numbers it replaces.
export function SkeletonAmount({ size = "sm" }: { size?: "sm" | "lg" | "xl" }) {
  const dims = { sm: "h-4 w-24", lg: "h-7 w-36", xl: "h-9 w-48" }
  return <Skeleton className={cn("ml-auto", dims[size])} />
}

// SkeletonTile: a dashboard stat: small label, big figure, optional note.
export function SkeletonTile({ note = true }: { note?: boolean }) {
  return (
    <div className="grid gap-2 rounded-sm border bg-card p-4">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-7 w-32" />
      {note && <Skeleton className="h-3 w-24" />}
    </div>
  )
}

// SkeletonRows: a table in the TableCard frame. `cols` are the column shapes: "text" is a
// name, "amount" a right-aligned figure, "short" a date or code.
export function SkeletonRows({ rows = 5, cols = ["text", "amount"], head = false }: { rows?: number; cols?: ("text" | "amount" | "short")[]; head?: boolean }) {
  const cell = (c: "text" | "amount" | "short", r: number) => {
    if (c === "amount") return <Skeleton className={cn("ml-auto h-4", r % 3 === 0 ? "w-28" : r % 3 === 1 ? "w-20" : "w-24")} />
    if (c === "short") return <Skeleton className="h-4 w-14" />
    return <Skeleton className={cn("h-4", r % 2 ? "w-2/3" : "w-1/2")} />
  }
  return (
    <div className="overflow-hidden rounded-sm border bg-card">
      {head && (
        <div className="flex gap-4 border-b bg-[#f7f8fa] px-4 py-2.5">
          {cols.map((_, i) => <Skeleton key={i} className={cn("h-3.5", i === 0 ? "w-24 flex-1" : "w-16")} />)}
        </div>
      )}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          {cols.map((c, i) => <div key={i} className={cn(i === 0 ? "flex-1" : "w-28 shrink-0")}>{cell(c, r)}</div>)}
        </div>
      ))}
    </div>
  )
}

// SkeletonCards: a stack of list cards (contacts, cards, goals): a title line, a figure, a bar.
export function SkeletonCards({ count = 3, bar = false }: { count?: number; bar?: boolean }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-3 rounded-sm border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className={cn("h-4", i % 2 ? "w-40" : "w-28")} />
            <SkeletonAmount />
          </div>
          {bar ? <Skeleton className="h-2 w-full" /> : <Skeleton className="h-3 w-1/3" />}
        </div>
      ))}
    </div>
  )
}

// SkeletonHeading: a section title, sized like the h2 it replaces.
export function SkeletonHeading({ className }: { className?: string }) {
  return <Skeleton className={cn("h-5 w-40", className)} />
}

// SkeletonChart: a bar chart's silhouette. Heights are fixed, so the shape is calm, not random.
export function SkeletonChart({ bars = 12, className }: { bars?: number; className?: string }) {
  const heights = [40, 65, 50, 80, 55, 70, 45, 85, 60, 50, 75, 65]
  return (
    <div className={cn("flex h-40 items-end gap-1.5 rounded-sm border bg-card p-4", className)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => <Skeleton key={i} className="flex-1" style={{ height: `${heights[i % heights.length]}%` }} />)}
    </div>
  )
}
