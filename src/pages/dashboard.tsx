import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { Card, CardContent } from "@/components/ui/card"
import { getDashboard, useEntriesVersion, type BudgetRow, type Dashboard } from "@/lib/api"
import { cn, fmtIDR } from "@/lib/utils"
import { Term } from "@/components/term"
import { useT } from "@/lib/i18n"
import type { ComponentChildren } from "preact"
import { DueBills } from "@/pages/cards"
import { DueList } from "@/pages/recurring"

function Tile({ label, value, note, tone }: { label: ComponentChildren; value: string; note?: string; tone?: string }) {
  return (
    <Card className="rounded-sm bg-gradient-to-b from-[#eaf2ff]/70 to-white">
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone)}>{value}</p>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

// BudgetBar: width is capped at 100%; the text says how far over, so colour is not the only signal.
export function BudgetBar({ row }: { row: BudgetRow }) {
  const t = useT()
  const pct = row.budget > 0 ? Math.min(100, (row.actual / row.budget) * 100) : 0
  return (
    <li className="grid gap-1">
      <div className="flex flex-wrap justify-between gap-x-3 text-sm">
        <span>{row.name}</span>
        <span className="tabular-nums text-muted-foreground">
          {row.budget > 0 ? t("dash.ofBudget", { actual: fmtIDR(row.actual), budget: fmtIDR(row.budget) }) : t("dash.spentNoBudget", { actual: fmtIDR(row.actual) })}
          {row.budget > 0 && (
            <span className={cn("ml-2 font-medium", row.over ? "text-rose-700" : "text-emerald-700")}>
              {row.over ? t("dash.overBy", { amount: fmtIDR(-row.remaining) }) : t("dash.left", { amount: fmtIDR(row.remaining) })}
            </span>
          )}
        </span>
      </div>
      <div
        role="meter"
        aria-label={t("dash.budgetUsed", { name: row.name })}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-sm bg-[#e6ebf5]"
      >
        <div className={cn("h-full", row.over ? "bg-rose-600" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </li>
  )
}

export function DashboardPage() {
  const t = useT()
  const [date, setDate] = usePeriodDate()
  const [d, setD] = useState<Dashboard | null>(null)
  const [err, setErr] = useState<FormError>({})
  const version = useEntriesVersion()

  useEffect(() => {
    getDashboard(date).then((r) => (setErr({}), setD(r))).catch((e) => setErr(toFormError(e)))
  }, [date, version])

  return (
    <AppShell title={t("dash.title")} actions={<PeriodPicker period={d?.period} onChange={setDate} />}>
      <div className="grid gap-6">
        <Status err={err} ok="" />
        <DueBills />
        <DueList />
        {d && (
          <>
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
              <Tile label={<Term k="revenue">{t("dash.income")}</Term>} value={fmtIDR(d.income)} tone="text-emerald-700" />
              <Tile label={<Term k="expense">{t("dash.expense")}</Term>} value={fmtIDR(d.expense)} tone="text-rose-700" />
              <Tile label={<Term k="surplus">{t("dash.surplus")}</Term>} value={fmtIDR(d.surplus)} tone={d.surplus < 0 ? "text-rose-700" : undefined} note={d.surplus < 0 ? t("dash.deficit") : undefined} />
              <Tile label={<Term k="savingsRate">{t("dash.savingsRate")}</Term>} value={`${(d.savings_rate * 100).toFixed(1)}%`} note={t("dash.movedToSavings", { amount: fmtIDR(d.to_savings_total) })} />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <section aria-labelledby="sav-title" className="grid content-start gap-3">
                <h2 id="sav-title" className="text-lg font-semibold">{t("dash.toSavings")}</h2>
                <TableCard>
                  <tbody className="tabular-nums">
                    {d.to_savings.map((r) => (
                      <tr key={r.account_id}>
                        <td>{r.name}</td>
                        <td className="text-right">{fmtIDR(r.amount)}</td>
                      </tr>
                    ))}
                    {d.to_savings.length === 0 && (
                      <tr><td className="py-8! text-center text-muted-foreground">{t("dash.noSavings")}</td></tr>
                    )}
                  </tbody>
                </TableCard>
              </section>

              <section aria-labelledby="bal-title" className="grid content-start gap-3">
                <h2 id="bal-title" className="text-lg font-semibold"><Term k="asset">{t("dash.assetBalances")}</Term></h2>
                <TableCard>
                  <tbody className="tabular-nums">
                    {/* Zero balances are noise here; Trial balance lists every account. */}
                    {d.balances.filter((r) => r.balance !== 0).map((r) => (
                      <tr key={r.account_id}>
                        <td>{r.name} <span className="text-xs text-muted-foreground">{r.category}</span></td>
                        <td className="text-right">{fmtIDR(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableCard>
              </section>
            </div>

            <section aria-labelledby="bud-title" className="grid gap-3">
              <div className="flex items-end justify-between">
                <h2 id="bud-title" className="text-lg font-semibold"><Term k="budget">{t("dash.budgets")}</Term></h2>
                <a href={`/app/budgets?date=${date}`} className="text-sm text-primary hover:underline">{t("dash.setBudgets")}</a>
              </div>
              <Card className="rounded-sm">
                <CardContent>
                  <ul className="grid gap-4">
                    {d.budgets.map((r) => <BudgetBar key={r.account_id} row={r} />)}
                  </ul>
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}
