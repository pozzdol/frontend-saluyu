import { ChevronLeft, ChevronRight } from "lucide-react"
import { useLocation } from "preact-iso"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Period } from "@/lib/api"
import { todayISO } from "@/lib/utils"

// usePeriodDate keeps the viewed date in ?date= so a period is linkable; other query params survive.
export function usePeriodDate() {
  const { path, query, route } = useLocation()
  const set = (date: string) => date && route(`${path}?${new URLSearchParams({ ...query, date })}`, true)
  return [query.date || todayISO(), set] as const
}

export function PeriodPicker({ period, onChange }: { period?: Period; onChange: (date: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="rounded-sm bg-white" aria-label="Previous period" disabled={!period} onClick={() => period && onChange(period.prev)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-44 text-center text-sm font-medium tabular-nums" aria-live="polite">{period?.label ?? "…"}</span>
      <Button variant="outline" size="icon" className="rounded-sm bg-white" aria-label="Next period" disabled={!period} onClick={() => period && onChange(period.next)}>
        <ChevronRight />
      </Button>
      <Input type="date" aria-label="Jump to date" value={period?.start} className="h-9 w-40 rounded-sm bg-white" onChange={(e) => onChange((e.target as HTMLInputElement).value)} />
    </div>
  )
}
