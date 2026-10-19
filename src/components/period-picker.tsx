import { ChevronLeft, ChevronRight } from "lucide-react"
import { useLocation } from "preact-iso"
import { DatePicker, DayOfMonthPicker, SelectPicker, fmtPeriod } from "@/components/picker"
import { Label } from "@/components/ui/label"
import { intlLocale, useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import type { Period, PeriodMode, User } from "@/lib/api"
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

export type PeriodSettings = Pick<User, "period_mode" | "period_start_day" | "period_weekday">

// PeriodFields chooses how periods are cut: from payday (1..31), the last workday, the 1st, or weekly.
// With name set it also renders hidden inputs, so it can sit inside a plain form.
export function PeriodFields({ value, onChange, name }: { value: PeriodSettings; onChange: (v: PeriodSettings) => void; name?: boolean }) {
  const t = useT()
  const set = (patch: Partial<PeriodSettings>) => onChange({ ...value, ...patch })
  // 4 Jan 1970 was a Sunday: weekday names in the app's language without a dictionary.
  const weekday = (n: number) => new Intl.DateTimeFormat(intlLocale(), { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(1970, 0, 4 + n)))
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="period_mode">{t("f12.periodStarts")}</Label>
        <SelectPicker id="period_mode" title={t("f12.periodStarts")} value={value.period_mode} onChange={(v) => set({ period_mode: v as PeriodMode })}
          options={[
            { value: "payday", label: t("f12.modePayday") },
            { value: "last_workday", label: t("f12.modeLastWorkday") },
            { value: "calendar_month", label: t("f12.modeCalendar") },
            { value: "weekly", label: t("f12.modeWeekly") },
          ]} />
      </div>
      {value.period_mode === "payday" && (
        <div className="grid gap-1.5">
          <Label htmlFor="period_start_day">{t("prof.payday")}</Label>
          <DayOfMonthPicker id="period_start_day" max={31} value={value.period_start_day} onChange={(d) => set({ period_start_day: d })} />
        </div>
      )}
      {value.period_mode === "last_workday" && <p className="text-xs text-muted-foreground">{t("f12.lastWorkdayHint")}</p>}
      {value.period_mode === "weekly" && (
        <div className="grid gap-1.5">
          <Label htmlFor="period_weekday">{t("f12.weekStarts")}</Label>
          <SelectPicker id="period_weekday" title={t("f12.weekStarts")} value={String(value.period_weekday)} onChange={(v) => set({ period_weekday: Number(v) })}
            options={[1, 2, 3, 4, 5, 6, 0].map((n) => ({ value: String(n), label: weekday(n) }))} />
        </div>
      )}
      {name && (
        <>
          <input type="hidden" name="period_mode" value={value.period_mode} />
          <input type="hidden" name="period_start_day" value={String(value.period_start_day)} />
          <input type="hidden" name="period_weekday" value={String(value.period_weekday)} />
        </>
      )}
    </div>
  )
}
