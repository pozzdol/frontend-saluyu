import { CheckCircle2, XCircle } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { Badge } from "@/components/ui/badge"
import { getBalanceSheet, getIncomeStatement, type AmountRow, type BalanceSheet, type IncomeStatement } from "@/lib/api"
import { fmtIDR } from "@/lib/utils"
import { useLocation } from "preact-iso"
import { DatePicker, fmtDate } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import type { ComponentChildren } from "preact"
import { Term, type TermKey } from "@/components/term"
import { t, useT } from "@/lib/i18n"

const views = { pl: "report.pl", bs: "report.bs" } as const

// Section: a heading row, its accounts, then a total row.
function Section({ title, term, rows, total }: { title: string; term: TermKey; rows: AmountRow[]; total: number }) {
  return (
    <>
      <tr className="bg-[#f7f8fa] font-medium"><td colSpan={2}><Term k={term}>{title}</Term></td></tr>
      {rows.map((r) => (
        <tr key={r.account_id}>
          <td className="pl-8!">{r.code} · {r.name}</td>
          <td className="text-right whitespace-nowrap">{fmtIDR(r.amount)}</td>
        </tr>
      ))}
      <tr className="font-semibold"><td>{t("report.totalOf", { name: title.toLowerCase() })}</td><td className="text-right whitespace-nowrap">{fmtIDR(total)}</td></tr>
    </>
  )
}

function Total({ label, value }: { label: ComponentChildren; value: number }) {
  return (
    <tr className="bg-[#eaf2ff]/60 font-semibold"><td>{label}</td><td className="text-right whitespace-nowrap">{fmtIDR(value)}</td></tr>
  )
}

export function ReportsPage() {
  const t = useT()
  const { query, route, path } = useLocation()
  const view = query.view === "bs" ? "bs" : "pl"
  const [date, setDate] = usePeriodDate()
  const [pl, setPl] = useState<IncomeStatement | null>(null)
  const [bs, setBs] = useState<BalanceSheet | null>(null)
  const [err, setErr] = useState<FormError>({})

  // Both reports load together, so switching tabs never shows an empty page while fetching.
  // The old numbers stay on screen until the new ones arrive.
  useEffect(() => {
    Promise.all([getIncomeStatement(date).then(setPl), getBalanceSheet(date).then(setBs)])
      .then(() => setErr({}))
      .catch((e) => setErr(toFormError(e)))
  }, [date])

  return (
    <AppShell
      title={t("report.title")}
      actions={
        view === "pl" ? (
          <PeriodPicker period={pl?.period} onChange={setDate} />
        ) : (
          // Same height as PeriodPicker so the header does not jump between tabs.
          <DatePicker
            aria-label={t("report.asOfLabel")}
            title={t("report.asOfLabel")}
            value={bs?.as_of ?? date}
            display={t("picker.asOf", { date: fmtDate(bs?.as_of ?? date) })}
            onChange={(d) => d && setDate(d)}
            className="w-full justify-center bg-white font-medium md:h-9 md:w-64"
          />
        )
      }
    >
      <div className="grid gap-4">
        <Segmented
          label={t("report.tabs")}
          value={view}
          onChange={(k) => route(`${path}?${new URLSearchParams({ ...query, view: k })}`, true)}
          items={(Object.keys(views) as (keyof typeof views)[]).map((k) => ({ value: k, label: <Term k={k === "pl" ? "incomeStatement" : "balanceSheet"}>{t(views[k])}</Term> }))}
        />
        <Status err={err} ok="" />

        {view === "pl" && pl && (
          <TableCard>
            <tbody className="tabular-nums">
              <Section title={t("report.revenue")} term="revenue" rows={pl.revenue} total={pl.revenue_total} />
              <Section title={t("report.expense")} term="expense" rows={pl.expense} total={pl.expense_total} />
              <Total label={<Term k="surplus">{t("report.netIncome")}</Term>} value={pl.net_income} />
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
                <tr><td className="pl-8!"><Term k="currentEarnings">{t("report.currentEarnings")}</Term></td><td className="text-right whitespace-nowrap">{fmtIDR(bs.current_earnings)}</td></tr>
                <Total label={t("report.check")} value={bs.liabilities_total + bs.equity_total + bs.current_earnings} />
              </tbody>
            </TableCard>
          </>
        )}
      </div>
    </AppShell>
  )
}
