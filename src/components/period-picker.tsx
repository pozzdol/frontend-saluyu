import { ChevronLeft, ChevronRight } from "lucide-react"
import { useLocation } from "preact-iso"
import { DatePicker, fmtPeriod } from "@/components/picker"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import type { Period } from "@/lib/api"
import { todayISO } from "@/lib/utils"

// usePeriodDate keeps the viewed date in ?date= so a period is linkable; other query params survive.
export function usePeriodDate() {
  const { path, query, route } = useLocation()
  const set = (date: string) => date && route(`${path}?${new URLSearchParams({ ...query, date })}`, true)
  return [query.date || todayISO(), set] as const
}

// PeriodPicker: previous / next period, and the label itself opens a calendar to jump to any date.
export function PeriodPicker({ period, onChange }: { period?: Period; onChange: (date: string) => void }) {
  const t = useT()
  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <Button variant="outline" size="icon" className="shrink-0 rounded-sm bg-white" aria-label={t("picker.prevPeriod")} disabled={!period} onClick={() => period && onChange(period.prev)}>
        <ChevronLeft />
      </Button>
      <DatePicker
        aria-label={t("picker.jumpTo")}
        title={t("picker.jumpTo")}
        value={period?.start ?? ""}
        display={period ? fmtPeriod(period) : "…"}
        onChange={(d) => d && onChange(d)}
        className="flex-1 justify-center bg-white font-medium tabular-nums md:h-9 md:w-56 md:flex-none"
      />
      <Button variant="outline" size="icon" className="shrink-0 rounded-sm bg-white" aria-label={t("picker.nextPeriod")} disabled={!period} onClick={() => period && onChange(period.next)}>
        <ChevronRight />
      </Button>
    </div>
  )
}
