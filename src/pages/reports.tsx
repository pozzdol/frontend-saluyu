import { CheckCircle2, XCircle } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getBalanceSheet, getIncomeStatement, type AmountRow, type BalanceSheet, type IncomeStatement } from "@/lib/api"
import { cn, fmtIDR } from "@/lib/utils"
import { useLocation } from "preact-iso"

const views = { pl: "Income statement", bs: "Balance sheet" } as const

// Section: a heading row, its accounts, then a total row.
function Section({ title, rows, total }: { title: string; rows: AmountRow[]; total: number }) {
  return (
    <>
      <tr className="bg-[#f7f8fa] font-medium"><td colSpan={2}>{title}</td></tr>
      {rows.map((r) => (
        <tr key={r.account_id}>
          <td className="pl-8!">{r.code} · {r.name}</td>
          <td className="text-right whitespace-nowrap">{fmtIDR(r.amount)}</td>
        </tr>
      ))}
      <tr className="font-semibold"><td>Total {title.toLowerCase()}</td><td className="text-right whitespace-nowrap">{fmtIDR(total)}</td></tr>
    </>
  )
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <tr className="bg-[#eaf2ff]/60 font-semibold"><td>{label}</td><td className="text-right whitespace-nowrap">{fmtIDR(value)}</td></tr>
  )
}

export function ReportsPage() {
  const { query, route, path } = useLocation()
  const view = query.view === "bs" ? "bs" : "pl"
  const [date, setDate] = usePeriodDate()
  const [pl, setPl] = useState<IncomeStatement | null>(null)
  const [bs, setBs] = useState<BalanceSheet | null>(null)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    const load = view === "pl" ? getIncomeStatement(date).then(setPl) : getBalanceSheet(date).then(setBs)
    load.then(() => setErr({})).catch((e) => setErr(toFormError(e)))
  }, [view, date])

  return (
    <AppShell
      title="Reports"
      actions={
        view === "pl" ? (
          <PeriodPicker period={pl?.period} onChange={setDate} />
        ) : (
          <div className="grid gap-1">
            <Label htmlFor="as_of">As of</Label>
            <Input id="as_of" type="date" value={date} className="h-9 rounded-sm bg-white" onChange={(e) => setDate((e.target as HTMLInputElement).value)} />
          </div>
        )
      }
    >
      <div className="grid gap-4">
        <div role="tablist" aria-label="Report" className="inline-flex w-fit rounded-sm border bg-[#f7f8fa] p-1">
          {(Object.keys(views) as (keyof typeof views)[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={view === k}
              onClick={() => route(`${path}?${new URLSearchParams({ ...query, view: k })}`, true)}
              className={cn("rounded-sm px-4 py-1.5 text-sm text-muted-foreground", view === k && "bg-white font-medium text-primary shadow-sm")}
            >
              {views[k]}
            </button>
          ))}
        </div>
        <Status err={err} ok="" />

        {view === "pl" && pl && (
          <TableCard>
            <tbody className="tabular-nums">
              <Section title="Revenue" rows={pl.revenue} total={pl.revenue_total} />
              <Section title="Expense" rows={pl.expense} total={pl.expense_total} />
              <Total label="Net income" value={pl.net_income} />
            </tbody>
          </TableCard>
        )}

        {view === "bs" && bs && (
          <>
            {bs.balanced ? (
              <Badge className="w-fit rounded-sm bg-emerald-50 px-2.5 py-1 text-emerald-700"><CheckCircle2 /> Balanced</Badge>
            ) : (
              <Badge className="w-fit rounded-sm bg-rose-50 px-2.5 py-1 text-rose-700">
                <XCircle /> Not balanced: off by {fmtIDR(Math.abs(bs.assets_total - bs.liabilities_total - bs.equity_total - bs.current_earnings))}
              </Badge>
            )}
            <TableCard>
              <tbody className="tabular-nums">
                <Section title="Assets" rows={bs.assets} total={bs.assets_total} />
                <Section title="Liabilities" rows={bs.liabilities} total={bs.liabilities_total} />
                <Section title="Equity" rows={bs.equity} total={bs.equity_total} />
                <tr><td className="pl-8!">Current earnings</td><td className="text-right whitespace-nowrap">{fmtIDR(bs.current_earnings)}</td></tr>
                <Total label="Liabilities + equity + current earnings" value={bs.liabilities_total + bs.equity_total + bs.current_earnings} />
              </tbody>
            </TableCard>
          </>
        )}
      </div>
    </AppShell>
  )
}
