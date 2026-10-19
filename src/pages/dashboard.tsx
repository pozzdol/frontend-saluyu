import { useEffect, useState } from "preact/hooks"
import { AppShell, Soon, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { Card, CardContent } from "@/components/ui/card"
import { getDashboard, useEntriesVersion, type BudgetRow, type Dashboard } from "@/lib/api"
import { cn, fmtIDR, fmtPercent, todayISO } from "@/lib/utils"
import { fmtDate } from "@/components/picker"
import { IndonesianNames } from "@/pages/accounts"
import { Term } from "@/components/term"
import { useT, type Key } from "@/lib/i18n"
import { ChevronRight, Flame } from "lucide-react"
import type { ComponentChildren } from "preact"
import { DueBills } from "@/pages/cards"
import { useCount, useTween } from "@/lib/motion"
import { DueList } from "@/pages/recurring"
import { InsightsTop, TrendsAndHealth } from "@/pages/insights"
import { Goals } from "@/pages/goals"
import { Loading, Skeleton, SkeletonHeading, SkeletonRows, SkeletonTile } from "@/components/skeleton"

// Tile counts to its value, so switching period shows which way each number moved.
function Tile({ label, value, format = fmtIDR, step = 100, note, tone }: { label: ComponentChildren; value: number; format?: (n: number) => string; step?: number; note?: string; tone?: string }) {
  const ref = useCount<HTMLParagraphElement>(value, format, step)
  return (
    <Card className="rounded-sm bg-gradient-to-b from-[#eaf2ff]/70 to-white">
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p ref={ref} className={cn("mt-1 text-xl font-semibold tabular-nums", tone)} />
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </CardContent>
    </Card>
  )
}

// BudgetBar: width is capped at 100%; the text says how far over, so colour is not the only signal.
export function BudgetBar({ row }: { row: BudgetRow }) {
  const t = useT()
  const pct = row.available > 0 ? Math.min(100, (row.actual / row.available) * 100) : row.actual > 0 ? 100 : 0
  const near = !row.over && pct >= 80
  const bar = useTween<HTMLDivElement>(pct, (el, n) => (el.style.width = `${n}%`))
  return (
    <li className="grid gap-1">
      <div className="flex flex-wrap justify-between gap-x-3 text-sm">
        <span>{row.name}</span>
        <span className="tabular-nums text-muted-foreground">
          {row.budget > 0 ? t("dash.ofBudget", { actual: fmtIDR(row.actual), budget: fmtIDR(row.available) }) : t("dash.spentNoBudget", { actual: fmtIDR(row.actual) })}
          {row.budget > 0 && (
            <span className={cn("ml-2 font-medium", row.over ? "text-rose-700" : near ? "text-amber-800" : "text-emerald-700")}>
              {row.over ? t("dash.overBy", { amount: fmtIDR(-row.remaining) }) : t("dash.left", { amount: fmtIDR(row.remaining) })}
              {near && ` · ${t("dash.nearlyUsed")}`}
            </span>
          )}
        </span>
      </div>
      {row.budget_carry && row.carry !== 0 && (
        <span className="text-xs text-muted-foreground">
          {t(row.carry > 0 ? "fase14.carryHint" : "fase14.carryDebt", { amount: fmtIDR(Math.abs(row.carry)) })}
        </span>
      )}
      <div
        role="meter"
        aria-label={t("dash.budgetUsed", { name: row.name })}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-sm bg-[#e6ebf5]"
      >
        <div ref={bar} className={cn("h-full", row.over ? "bg-rose-600" : near ? "bg-amber-500" : "bg-primary")} />
      </div>
    </li>
  )
}

// FirstSteps greets a fresh book: an empty dashboard is an invitation, so it says where to go.
function FirstSteps() {
  const t = useT()
  const steps: [Key, string][] = [
    ["first.record", "/app/transactions"],
    ["first.budget", "/app/budgets"],
    ["first.recurring", "/app/recurring"],
    ["first.import", "/app/import"],
  ]
  return (
    <section className="grid gap-3 rounded-sm border border-[#cfe0ff] bg-[#f4f8ff] p-4">
      <h2 className="font-semibold">{t("first.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("first.hint")}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {steps.map(([k, href]) => (
          <li key={k}>
            <a href={href} className="flex min-h-11 items-center justify-between gap-2 rounded-sm border bg-background px-3 text-sm font-medium text-primary hover:bg-[#eaf2ff]">
              {t(k)} <ChevronRight className="size-4" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

// DashboardSkeleton mirrors the dashboard's own data: the total, four tiles, two tables.
// InsightsTop and TrendsAndHealth bring their own skeletons below it.
function DashboardSkeleton() {
  return (
    <Loading>
      <div className="grid gap-2 rounded-sm border bg-card px-4 py-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <SkeletonTile key={i} />)}
      </div>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <div className="grid gap-3"><SkeletonHeading /><SkeletonRows rows={3} /></div>
        <div className="grid gap-3"><SkeletonHeading /><SkeletonRows rows={4} /></div>
      </div>
    </Loading>
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
        {!d && !err.message && <DashboardSkeleton />}
        {d && (
          // "Total uangku" first: the one number everyone looks for.
          <section className="rounded-sm border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">{t("f12.totalMoney")}</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{fmtIDR(d.cash_total)}</p>
            <p className="text-xs text-muted-foreground">{t("f12.totalMoneyHint", { date: fmtDate(d.period.end < todayISO() ? d.period.end : todayISO()) })}</p>
          </section>
        )}
        <IndonesianNames />
        <DueBills />
        <DueList />
        {d && d.income === 0 && d.expense === 0 && d.budgets.every((r) => r.budget === 0) && <FirstSteps />}
        <InsightsTop date={date} />
        {d && d.streak_days > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Flame className="size-4 text-amber-500" /> {t("notify.streak", { n: d.streak_days })}
          </p>
        )}
        {d && (
          <>
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
              <Tile label={<Term k="revenue">{t("dash.income")}</Term>} value={d.income} tone="text-emerald-700" />
              <Tile label={<Term k="expense">{t("dash.expense")}</Term>} value={d.expense} tone="text-rose-700" />
              {/* Left of the period's money (its opening cash + income): a deficit only past that. */}
              <Tile label={<Term k="surplus">{t("f12.left")}</Term>} value={d.period_money - d.expense} tone={d.period_money < d.expense ? "text-rose-700" : undefined}
                note={d.period_money < d.expense ? t("dash.deficit") : t("f12.leftNote", { money: fmtIDR(d.period_money), opening: fmtIDR(d.opening_cash), income: fmtIDR(d.income) })} />
              <Tile label={<Term k="savingsRate">{t("dash.savingsRate")}</Term>} value={d.savings_rate} format={(n) => fmtPercent(n)} step={0} note={t("dash.movedToSavings", { amount: fmtIDR(d.to_savings_total) })} />
            </div>

            <div className="grid items-start gap-6 md:grid-cols-2">
              {/* An empty card says nothing: until there is data it is one line saying when it comes. */}
              {d.to_savings.length === 0 ? (
                <Soon>{t("f12.soonSavings")}</Soon>
              ) : (
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
                  </tbody>
                </TableCard>
              </section>
              )}

              <section aria-labelledby="bal-title" className="grid content-start gap-3">
                <h2 id="bal-title" className="text-lg font-semibold"><Term k="asset">{t("dash.assetBalances")}</Term></h2>
                <TableCard>
                  <tbody className="tabular-nums">
                    {/* Zero balances are noise here; Trial balance lists every account. */}
                    {d.balances.filter((r) => r.balance !== 0).map((r) => (
                      <tr key={r.account_id}>
                        <td>{r.name}</td>
                        <td className="text-right">{fmtIDR(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TableCard>
              </section>
            </div>

            {d.budgets.every((r) => r.budget === 0) ? (
              <Soon>{t("f12.soonBudgets")} <a href={`/app/budgets?date=${date}`} className="text-primary hover:underline">{t("dash.setBudgets")}</a></Soon>
            ) : (
            <section aria-labelledby="bud-title" className="grid gap-3">
              <div className="flex items-end justify-between">
                <h2 id="bud-title" className="text-lg font-semibold"><Term k="budget">{t("dash.budgets")}</Term></h2>
                <a href={`/app/budgets?date=${date}`} className="text-sm text-primary hover:underline">{t("dash.setBudgets")}</a>
              </div>
              <Card className="rounded-sm">
                <CardContent>
                  {/* Only the categories the user chose to limit; the rest is on the Budgets page. */}
                  <ul className="grid gap-4">
                    {d.budgets.filter((r) => r.budget > 0).map((r) => <BudgetBar key={r.account_id} row={r} />)}
                  </ul>
                </CardContent>
              </Card>
            </section>
            )}
          </>
        )}
        <Goals />
        <TrendsAndHealth date={date} />
      </div>
    </AppShell>
  )
}
