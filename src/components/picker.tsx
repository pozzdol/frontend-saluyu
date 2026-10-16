import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useSyncExternalStore } from "preact/compat"
import { useEffect, useMemo, useState } from "preact/hooks"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { intlLocale, useT } from "@/lib/i18n"
import { cn, todayISO } from "@/lib/utils"

// ---- layout helpers ----

const mobileQuery = "(max-width: 767px)"

// useIsMobile follows the md breakpoint: phones get bottom sheets, larger screens popovers.
export function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(mobileQuery)
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => window.matchMedia(mobileQuery).matches,
  )
}

// The trigger looks like an input so forms stay visually consistent.
export const triggerClass =
  "flex h-11 w-full items-center gap-2 rounded-sm border border-input bg-background px-3 text-left text-base outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:h-10 md:text-sm"

type ShellProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  trigger: ComponentChildren
  children: ComponentChildren
  wide?: boolean
}

// PickerShell shows its content in a bottom sheet on phones and a popover elsewhere.
function PickerShell({ open, onOpenChange, title, trigger, children, wide }: ShellProps) {
  const mobile = useIsMobile()
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" title={title}>
          {children}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className={cn("max-h-96 overflow-y-auto rounded-sm p-2", wide ? "w-80" : "w-(--radix-popover-trigger-width) min-w-64")}>
        {children}
      </PopoverContent>
    </Popover>
  )
}

// ---- select ----

export type Option = { value: string; label: string; hint?: string; group?: string }

type SelectPickerProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  title: string // sheet heading, e.g. "Paid from"
  placeholder?: string
  invalid?: boolean
  className?: string
  "aria-label"?: string
}

// SelectPicker replaces <select>: a searchable list (search appears for long lists),
// options grouped under headings, the current choice marked with a check.
export function SelectPicker({ id, value, onChange, options, title, placeholder, invalid, className, ...rest }: SelectPickerProps) {
  const t = useT()
  placeholder ??= t("common.choose")
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const selected = options.find((o) => o.value === value)
  const searchable = options.length > 7

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(needle)) : options
  }, [q, options])

  useEffect(() => {
    if (!open) setQ("")
  }, [open])

  let lastGroup: string | undefined
  return (
    <PickerShell
      open={open}
      onOpenChange={setOpen}
      title={title}
      trigger={
        <button type="button" id={id} aria-invalid={invalid} aria-label={rest["aria-label"]} aria-haspopup="listbox" className={cn(triggerClass, className)}>
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </button>
      }
    >
      {searchable && (
        <label className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-sm border bg-background px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus={false}
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            placeholder={t("common.search")}
            aria-label={t("picker.searchIn", { title })}
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none md:h-9 md:text-sm"
          />
        </label>
      )}
      <ul role="listbox" aria-label={title} className="grid gap-0.5">
        {shown.map((o) => {
          const heading = o.group && o.group !== lastGroup ? o.group : null
          lastGroup = o.group
          return (
            <li key={o.value} role="presentation">
              {heading && <p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{heading}</p>}
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => (onChange(o.value), setOpen(false))}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-base hover:bg-[#eaf2ff] md:min-h-9 md:text-sm",
                  o.value === value && "bg-[#eaf2ff] font-medium text-primary",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>}
                </span>
                {o.value === value && <Check className="size-4 shrink-0" />}
              </button>
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("common.noMatch")}</li>}
      </ul>
    </PickerShell>
  )
}

// ---- dates ----

// Formatters follow the current language: "16 Okt 2026" in Indonesian, "16 Oct 2026" in English.
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlLocale(), { ...opts, timeZone: "UTC" })
// 2024-01-01 was a Monday: the next seven days give the weekday initials in the current language.
const weekdays = () => Array.from({ length: 7 }, (_, i) => fmt({ weekday: "short" }).format(new Date(Date.UTC(2024, 0, 1 + i))).slice(0, 2))

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * 864e5))

// fmtDate shows "16 Okt 2026": unambiguous, unlike 10/16/2026 vs 16/10/2026.
export const fmtDate = (s: string) => (s ? fmt({ day: "numeric", month: "short", year: "numeric" }).format(parse(s)) : "")

// fmtPeriod shows a payday period as "25 Sep – 24 Okt 2026" in the current language.
export function fmtPeriod(p: { start: string; end: string }) {
  const s = parse(p.start), e = parse(p.end)
  const startOpts: Intl.DateTimeFormatOptions = s.getUTCFullYear() === e.getUTCFullYear()
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" }
  return `${fmt(startOpts).format(s)} – ${fmt({ day: "numeric", month: "short", year: "numeric" }).format(e)}`
}

// Calendar is a month grid, weeks starting Monday as in Indonesia.
export function Calendar({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const t = useT()
  const [month, setMonth] = useState(() => (value || todayISO()).slice(0, 7))
  const first = parse(`${month}-01`)
  const lead = (first.getUTCDay() + 6) % 7 // Monday = 0
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const today = todayISO()
  const shift = (n: number) => setMonth(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1))).slice(0, 7))

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <button type="button" aria-label={t("picker.prevMonth")} onClick={() => shift(-1)} className="grid size-11 place-items-center rounded-sm hover:bg-muted md:size-9">
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-sm font-semibold" aria-live="polite">{fmt({ month: "long", year: "numeric" }).format(first)}</span>
        <button type="button" aria-label={t("picker.nextMonth")} onClick={() => shift(1)} className="grid size-11 place-items-center rounded-sm hover:bg-muted md:size-9">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden="true">
        {weekdays().map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, "0")}`
          const picked = d === value
          return (
            <button
              key={d}
              type="button"
              aria-label={fmtDate(d)}
              aria-pressed={picked}
              onClick={() => onPick(d)}
              className={cn(
                "grid h-11 place-items-center rounded-sm text-sm tabular-nums hover:bg-[#eaf2ff] md:h-9",
                d === today && !picked && "font-semibold text-primary ring-1 ring-primary/40",
                picked && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type DatePickerProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  title: string
  placeholder?: string
  clearable?: boolean
  invalid?: boolean
  className?: string
  display?: string // trigger text instead of the formatted date, e.g. a period label
  "aria-label"?: string
}

// DatePicker replaces <input type="date"> with a calendar and quick picks.
export function DatePicker({ id, value, onChange, title, placeholder, clearable, invalid, className, display, ...rest }: DatePickerProps) {
  const t = useT()
  placeholder ??= t("picker.anyDate")
  const [open, setOpen] = useState(false)
  const pick = (d: string) => (onChange(d), setOpen(false))
  const today = todayISO()
  const chip = "h-11 rounded-full border px-4 text-sm hover:bg-[#eaf2ff] md:h-8 md:px-3"

  return (
    <PickerShell
      open={open}
      onOpenChange={setOpen}
      title={title}
      wide
      trigger={
        <button type="button" id={id} aria-invalid={invalid} aria-label={rest["aria-label"]} className={cn(triggerClass, className)}>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>{display ?? (value ? fmtDate(value) : placeholder)}</span>
        </button>
      }
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip} onClick={() => pick(today)}>{t("picker.today")}</button>
          <button type="button" className={chip} onClick={() => pick(addDays(today, -1))}>{t("picker.yesterday")}</button>
          {clearable && value && (
            <button type="button" className={cn(chip, "text-muted-foreground")} onClick={() => pick("")}>{t("picker.clear")}</button>
          )}
        </div>
        <Calendar value={value} onPick={pick} />
      </div>
    </PickerShell>
  )
}

// DayOfMonthPicker picks 1..28 (a payday that exists in every month).
export function DayOfMonthPicker({ id, value, onChange }: { id?: string; value: number; onChange: (day: number) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <PickerShell
      open={open}
      onOpenChange={setOpen}
      title={t("picker.payday")}
      wide
      trigger={
        <button type="button" id={id} className={triggerClass}>
          <span className="flex-1">{t("picker.dayOfMonth", { n: value })}</span>
          <ChevronDown className="size-4 opacity-60" />
        </button>
      }
    >
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === value}
            onClick={() => (onChange(d), setOpen(false))}
            className={cn("grid h-11 place-items-center rounded-sm text-sm tabular-nums hover:bg-[#eaf2ff] md:h-9", d === value && "bg-primary text-primary-foreground hover:bg-primary")}
          >
            {d}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("picker.payday28")}</p>
    </PickerShell>
  )
}
