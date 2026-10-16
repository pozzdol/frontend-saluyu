import type { ComponentChildren } from "preact"
import { useT } from "@/lib/i18n"
import { cn, fmtIDR } from "@/lib/utils"
import { useTween } from "@/lib/motion"

// Charts are plain SVG. Each one is a <figure> whose numbers are also written out (legend
// or labels) and available as a table, so nothing depends on colour or on seeing the shape.

const palette = ["#2563eb", "#f97316", "#10b981", "#a855f7", "#ef4444", "#0ea5e9", "#eab308", "#64748b"]

type Item = { label: string; value: number }

function TableAlt({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const t = useT()
  return (
    <details className="text-sm print:hidden">
      <summary className="cursor-pointer text-primary">{t("chart.asTable")}</summary>
      <table className="mt-2 w-full tabular-nums [&_td]:py-1 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium">
        <thead><tr>{head.map((h, i) => <th key={h} className={cn(i > 0 && "text-right!")}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className={cn(j > 0 && "text-right")}>{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  )
}

function Figure({ caption, children }: { caption: ComponentChildren; children: ComponentChildren }) {
  return (
    <figure className="grid gap-3">
      <figcaption className="font-semibold">{caption}</figcaption>
      {children}
    </figure>
  )
}

// Sweep covers the slices with the empty track and pulls it away clockwise once, when the
// chart first appears.
function Sweep({ r, c }: { r: number; c: number }) {
  const ref = useTween<SVGCircleElement>(1, (el, n) => el.setAttribute("stroke-dashoffset", String(-n * c)), { duration: 1100 })
  return <circle ref={ref} cx="80" cy="80" r={r} fill="none" stroke="#e6ebf5" strokeWidth="25" strokeDasharray={`${c} ${c}`} />
}

// Donut: share of a whole. The largest seven slices are shown, the rest grouped as "other".
export function Donut({ caption, items, total, otherLabel }: { caption: ComponentChildren; items: Item[]; total: number; otherLabel: string }) {
  const t = useT()
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const shown = sorted.length > 8 ? [...sorted.slice(0, 7), { label: otherLabel, value: sorted.slice(7).reduce((s, i) => s + i.value, 0) }] : sorted
  const r = 60, c = 2 * Math.PI * r
  let offset = 0
  return (
    <Figure caption={caption}>
      {total <= 0 ? (
        <p className="text-sm text-muted-foreground">{t("chart.empty")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 160 160" className="size-40 shrink-0 -rotate-90" aria-hidden="true">
            <circle cx="80" cy="80" r={r} fill="none" stroke="#e6ebf5" strokeWidth="24" />
            {shown.map((s, i) => {
              const len = (s.value / total) * c
              const el = <circle key={s.label} cx="80" cy="80" r={r} fill="none" stroke={palette[i % palette.length]} strokeWidth="24"
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
              offset += len
              return el
            })}
            <Sweep r={r} c={c} />
          </svg>
          <ul className="grid w-full min-w-0 gap-1.5 text-sm sm:w-auto sm:flex-1">
            {shown.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: palette[i % palette.length] }} />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="tabular-nums text-muted-foreground">{Math.round((s.value / total) * 100)}%</span>
                <span className="shrink-0 text-right font-medium tabular-nums">{fmtIDR(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Figure>
  )
}

// Bar grows from the baseline to its height, and on to a new height when the value changes.
function Bar({ x, h, width, delay, top }: { x: number; h: number; width: number; delay: number; top: boolean }) {
  const ref = useTween<SVGRectElement>(h, (el, n) => (el.setAttribute("y", String(42 - n)), el.setAttribute("height", String(n))), { delay })
  return <rect ref={ref} x={x} width={width} rx="0.4" fill={top ? "#2563eb" : "#93b4f5"} />
}

// Bars: one value per step (days of a period, or periods). The largest bar carries its value.
export function Bars({ caption, items, head, compact }: { caption: ComponentChildren; items: Item[]; head: [string, string]; compact?: (label: string) => string }) {
  const t = useT()
  const name = (label: string) => (compact ? compact(label) : label)
  const max = Math.max(1, ...items.map((i) => i.value))
  const w = 100 / Math.max(items.length, 1)
  const top = items.findIndex((i) => i.value === max)
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-36 w-full" aria-hidden="true">
        {items.map((it, i) => {
          const h = (it.value / max) * 40
          return <Bar key={it.label} x={i * w + w * 0.15} h={h} width={w * 0.7} delay={i * 12} top={i === top} />
        })}
        <line x1="0" y1="42" x2="100" y2="42" stroke="#cbd5e1" strokeWidth="0.3" />
      </svg>
      {items.length > 0 && (
        <>
          <p className="flex justify-between text-xs text-muted-foreground">
            <span>{name(items[0].label)}</span>
            <span>{name(items[items.length - 1].label)}</span>
          </p>
          {max > 1 && <p className="text-sm">{t("chart.highest", { label: name(items[top].label), amount: fmtIDR(max) })}</p>}
        </>
      )}
      <TableAlt head={head} rows={items.map((i) => [i.label, fmtIDR(i.value)])} />
    </Figure>
  )
}

// Lines: a few series over the same steps; the latest value of each is written in the legend.
export function Lines({ caption, labels, series }: { caption: ComponentChildren; labels: string[]; series: { name: string; values: number[] }[] }) {
  const all = series.flatMap((s) => s.values)
  const lo = Math.min(0, ...all), hi = Math.max(1, ...all)
  const x = (i: number) => (labels.length <= 1 ? 50 : (i / (labels.length - 1)) * 100)
  const y = (v: number) => 40 - ((v - lo) / (hi - lo || 1)) * 38
  return (
    <Figure caption={caption}>
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="h-36 w-full" aria-hidden="true">
        {lo < 0 && <line x1="0" y1={y(0)} x2="100" y2={y(0)} stroke="#cbd5e1" strokeWidth="0.3" strokeDasharray="1 1" />}
        {series.map((s, i) => (
          <polyline key={s.name} fill="none" stroke={palette[i % palette.length]} strokeWidth="0.8" vectorEffect="non-scaling-stroke"
            strokeDasharray={i % 2 ? "3 2" : undefined} points={s.values.map((v, j) => `${x(j)},${y(v)}`).join(" ")} />
        ))}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {series.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("h-0.5 w-5", i % 2 && "border-t-2 border-dashed bg-transparent!")} style={{ background: palette[i % palette.length], borderColor: palette[i % palette.length] }} />
            {s.name}: <span className="font-medium tabular-nums">{fmtIDR(s.values[s.values.length - 1] ?? 0)}</span>
          </li>
        ))}
      </ul>
      <TableAlt head={["", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => fmtIDR(s.values[i] ?? 0))])} />
    </Figure>
  )
}
