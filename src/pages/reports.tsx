import { CheckCircle2, FileSpreadsheet, Loader2, Lock, Printer, XCircle } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { DatePicker, SelectPicker, fmtDate } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import { Term, type TermKey } from "@/components/term"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  downloadReport,
  setLock,
  useAuth,
  getBalanceSheet,
  getCashFlow,
  getIncomeStatement,
  getTaxSummary,
  type AmountRow,
  type BalanceSheet,
  type CashFlow,
  type IncomeStatement,
  type TaxSummary,
} from "@/lib/api"
import { t, useT } from "@/lib/i18n"
import { cn, fmtIDR, todayISO } from "@/lib/utils"
import { toast } from "@/components/toast"

const views = { pl: "report.pl", bs: "report.bs", cf: "report.cf", tax: "report.tax" } as const
type View = keyof typeof views
const viewTerm: Record<View, TermKey> = { pl: "incomeStatement", bs: "balanceSheet", cf: "cashFlow", tax: "asset" }

const money = (v: number, extra?: string) => <td className={cn("text-right whitespace-nowrap", extra)}>{fmtIDR(v)}</td>
const wide = "max-md:hidden" // comparison columns

// Section: a heading row, its accounts, then a total row. With compare, two more columns:
// the previous period and the average of the three before.
function Section({ title, term, rows, total, compare, totalLabel }: { title: string; term?: TermKey; rows: AmountRow[]; total: number; compare?: [number, number]; totalLabel?: string }) {
  const cols = compare ? 4 : 2
  return (
    <>
      <tr className="bg-[#f7f8fa] font-medium"><td colSpan={cols}>{term ? <Term k={term}>{title}</Term> : title}</td></tr>
      {rows.map((r) => (
        <tr key={r.account_id}>
          <td className="pl-8!"><a href={`/app/accounts/${r.account_id}`} className="hover:text-primary hover:underline print:no-underline">{r.name}</a></td>
          {money(r.amount)}
          {compare && <>{money(r.prev ?? 0, wide)}{money(r.avg3 ?? 0, wide)}</>}
        </tr>
      ))}
      <tr className="font-semibold">
        <td>{totalLabel ?? t("report.totalOf", { name: title.toLowerCase() })}</td>
        {money(total)}
        {compare && <>{money(compare[0], wide)}{money(compare[1], wide)}</>}
      </tr>
    </>
  )
}

function Total({ label, value, more }: { label: ComponentChildren; value: number; more?: number[] }) {
  return (
    <tr className="bg-[#eaf2ff]/60 font-semibold"><td>{label}</td>{money(value)}{more?.map((v, i) => <td key={i} className={cn("text-right whitespace-nowrap", wide)}>{fmtIDR(v)}</td>)}</tr>
  )
}

// CloseBooks locks every entry up to the end of a finished period; a correction then goes in as
// a reversing or manual journal entry in an open period. Closing asks first: it blocks edits.
function CloseBooks({ periodEnd }: { periodEnd: string }) {
  const t = useT()
  const { user } = useAuth()
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const run = async (until: string | null) => {
    setBusy(true)
    setErr({})
    try {
      await setLock(until)
      setAsking(false)
      toast(until ? t("lock.closedToast", { date: fmtDate(until) }) : t("lock.reopenedToast"))
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }
  const locked = user?.locked_until
  const finished = periodEnd < todayISO() // a running period cannot be closed: today is in it
  return (
    <section className="grid gap-2 rounded-sm border bg-card p-4 print:hidden">
      <h2 className="flex items-center gap-2 font-semibold"><Lock className="size-4" /> {t("lock.title")}</h2>
      <p className="text-sm text-muted-foreground">{locked ? t("lock.closedUntil", { date: fmtDate(locked) }) : t("lock.open")}</p>
      <Status err={err} ok="" />
      {asking ? (
        <div className="grid gap-2 rounded-sm border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{t("lock.confirm", { date: fmtDate(periodEnd) })}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="rounded-sm" disabled={busy} onClick={() => run(periodEnd)}>
              {busy && <Loader2 className="animate-spin" />}{t("lock.confirmYes")}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(!locked || locked < periodEnd) && finished && (
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setAsking(true)}>{t("lock.close", { date: fmtDate(periodEnd) })}</Button>
          )}
          {locked && <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(null)}>{t("lock.reopen")}</Button>}
        </div>
      )}
      {!finished && (!locked || locked < periodEnd) && <p className="text-sm text-muted-foreground">{t("lock.notFinished")}</p>}
      <p className="text-xs text-muted-foreground">{t("lock.hint")}</p>
    </section>
  )
}

export function ReportsPage() {
  const t = useT()
  const { query, route, path } = useLocation()
  const view: View = (query.view as View) in views ? (query.view as View) : "pl"
  const [date, setDate] = usePeriodDate()
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [pl, setPl] = useState<IncomeStatement | null>(null)
  const [bs, setBs] = useState<BalanceSheet | null>(null)
  const [cf, setCf] = useState<CashFlow | null>(null)
  const [tax, setTax] = useState<TaxSummary | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)

  // The period reports load together, so switching tabs never shows an empty page while
  // fetching. The old numbers stay on screen until the new ones arrive.
  useEffect(() => {
    Promise.all([getIncomeStatement(date, true).then(setPl), getBalanceSheet(date).then(setBs), getCashFlow(date).then(setCf)])
      .then(() => setErr({}))
      .catch((e) => setErr(toFormError(e)))
  }, [date])
  useEffect(() => {
    if (view === "tax") getTaxSummary(year).then(setTax, (e) => setErr(toFormError(e)))
  }, [view, year])

  async function excel() {
    setBusy(true)
    try {
      await downloadReport(({ pl: "income", bs: "balance", cf: "cashflow", tax: "balance" } as const)[view], view === "tax" ? `${year}-12-31` : date)
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  const thisYear = new Date().getFullYear()
  const picker =
    view === "bs" ? (
      // Same height as PeriodPicker so the header does not jump between tabs.
      <DatePicker aria-label={t("report.asOfLabel")} title={t("report.asOfLabel")} value={bs?.as_of ?? date}
        display={t("picker.asOf", { date: fmtDate(bs?.as_of ?? date) })} onChange={(d) => d && setDate(d)}
        className="w-full justify-center bg-white font-medium md:h-9 md:w-64" />
    ) : view === "tax" ? (
      <SelectPicker aria-label={t("report.year")} title={t("report.year")} value={String(year)} onChange={(v) => setYear(Number(v))}
        options={Array.from({ length: 6 }, (_, i) => ({ value: String(thisYear - i), label: String(thisYear - i) }))} className="bg-white md:h-9 md:w-40" />
    ) : (
      <PeriodPicker period={(view === "pl" ? pl : cf)?.period} onChange={setDate} />
    )

  return (
    <AppShell title={t("report.title")} actions={<div className="print:hidden">{picker}</div>}>
      <div className="grid gap-4">
        <div className="print:hidden">
          <Segmented label={t("report.tabs")} value={view}
            onChange={(k) => route(`${path}?${new URLSearchParams({ ...query, view: k })}`, true)}
            items={(Object.keys(views) as View[]).map((k) => ({ value: k, label: k === "tax" ? t(views[k]) : <Term k={viewTerm[k]}>{t(views[k])}</Term> }))} />
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" className="rounded-sm" disabled={busy} onClick={excel}>
            {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel
          </Button>
          <Button variant="outline" size="sm" className="rounded-sm" onClick={() => window.print()}><Printer /> {t("report.print")}</Button>
          {view !== "tax" && (
            <Button variant="ghost" size="sm" className="rounded-sm" disabled={busy}
              onClick={() => downloadReport("journal", date).catch((e) => setErr(toFormError(e)))}>
              <FileSpreadsheet /> {t("report.journalExcel")}
            </Button>
          )}
        </div>
        <Status err={err} ok="" />
        <h2 className="hidden text-lg font-semibold print:block">
          {t(views[view])} · {view === "pl" ? pl?.period.label : view === "cf" ? cf?.period.label : view === "bs" ? fmtDate(bs?.as_of ?? date) : year}
        </h2>

        {view === "pl" && pl && (
          <TableCard>
            {pl.expense_compare && (
              <thead><tr><th /><th className="text-right!">{t("report.thisPeriod")}</th><th className={cn("text-right!", wide)}>{t("report.lastPeriod")}</th><th className={cn("text-right!", wide)}>{t("report.avg3")}</th></tr></thead>
            )}
            <tbody className="tabular-nums">
              <Section title={t("report.revenue")} term="revenue" rows={pl.revenue} total={pl.revenue_total} compare={pl.revenue_compare} />
              <Section title={t("report.expense")} term="expense" rows={pl.expense} total={pl.expense_total} compare={pl.expense_compare} />
              <Total label={<Term k="surplus">{t("report.netIncome")}</Term>} value={pl.net_income}
                more={pl.revenue_compare && pl.expense_compare ? [pl.revenue_compare[0] - pl.expense_compare[0], pl.revenue_compare[1] - pl.expense_compare[1]] : undefined} />
            </tbody>
          </TableCard>
        )}

        {view === "bs" && bs && (
          <>
            {bs.balanced ? (
              <Badge className="w-fit rounded-sm bg-emerald-50 px-2.5 py-1 text-emerald-700"><CheckCircle2 /> {t("report.balanced")}</Badge>
            ) : (
              <Badge className="w-fit rounded-sm bg-rose-50 px-2.5 py-1 text-rose-700">
                <XCircle /> {t("report.notBalanced", { amount: fmtIDR(Math.abs(bs.assets_total - bs.liabilities_total - bs.equity_total - bs.current_earnings)) })}
              </Badge>
            )}
            <TableCard>
              <tbody className="tabular-nums">
                <Section title={t("report.assets")} term="asset" rows={bs.assets} total={bs.assets_total} />
                <Section title={t("report.liabilities")} term="liability" rows={bs.liabilities} total={bs.liabilities_total} />
                <Section title={t("report.equity")} term="equity" rows={bs.equity} total={bs.equity_total} />
                <tr><td className="pl-8!"><Term k="currentEarnings">{t("report.currentEarnings")}</Term></td>{money(bs.current_earnings)}</tr>
                <Total label={t("report.check")} value={bs.liabilities_total + bs.equity_total + bs.current_earnings} />
              </tbody>
            </TableCard>
          </>
        )}

        {view === "cf" && cf && (
          <TableCard>
            <tbody className="tabular-nums">
              <tr className="font-medium"><td>{t("report.cashBegin", { date: fmtDate(cf.period.start) })}</td>{money(cf.beginning)}</tr>
              <Section title={t("report.operating")} rows={cf.operating.rows} total={cf.operating.total} />
              <Section title={t("report.investing")} rows={cf.investing.rows} total={cf.investing.total} />
              <Section title={t("report.financing")} rows={cf.financing.rows} total={cf.financing.total} />
              {cf.opening !== 0 && <tr><td>{t("report.openingEntered")}</td>{money(cf.opening)}</tr>}
              <tr className="font-semibold"><td>{t("report.netCash")}</td>{money(cf.net)}</tr>
              <Total label={t("report.cashEnd", { date: fmtDate(cf.period.end) })} value={cf.ending} />
            </tbody>
          </TableCard>
        )}
        {view === "cf" && <p className="text-xs text-muted-foreground">{t("report.cashNote")}</p>}

        {view === "pl" && pl && <CloseBooks periodEnd={pl.period.end} />}

        {view === "tax" && tax && (
          <>
            <p className={cn("rounded-sm bg-amber-50 p-3 text-sm text-amber-900")}>{t("report.taxNote")}</p>
            <TableCard>
              <tbody className="tabular-nums">
                <Section totalLabel={t("common.total")} title={t("report.taxIncome", { year: tax.year })} rows={tax.income} total={tax.income_total} />
                <Section totalLabel={t("common.total")} title={t("report.taxAssets", { date: fmtDate(tax.as_of) })} rows={tax.assets} total={tax.assets_total} />
                <Section totalLabel={t("common.total")} title={t("report.taxDebts", { date: fmtDate(tax.as_of) })} rows={tax.liabilities} total={tax.liabilities_total} />
              </tbody>
            </TableCard>
          </>
        )}
      </div>
    </AppShell>
  )
}
