import { AlertTriangle, Lightbulb, PiggyBank, TrendingDown, TrendingUp } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { Bars, Donut, Lines } from "@/components/charts"
import { fmtDate } from "@/components/picker"
import { Term, type TermKey } from "@/components/term"
import { Card, CardContent } from "@/components/ui/card"
import { getHealth, getInsights, getTrends, useEntriesVersion, type Health, type Insight, type Insights, type Ratio, type TrendPoint } from "@/lib/api"
import { intlLocale, useT, type Key } from "@/lib/i18n"
import { cn, fmtIDR } from "@/lib/utils"

function insightText(t: ReturnType<typeof useT>, i: Insight) {
  const vars = { name: i.name ?? "", amount: fmtIDR(i.amount), percent: Math.abs(i.percent).toLocaleString(), points: Math.abs(i.percent).toLocaleString() }
  return t(`ins.${i.kind}` as Key, vars)
}

// "14 Okt": the app's language, not the browser's.
const dayMonth = (iso: string) => new Intl.DateTimeFormat(intlLocale(), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`))

const insightIcon = { category_up: TrendingUp, category_down: TrendingDown, savings_up: PiggyBank, savings_down: TrendingDown }

// InsightsTop is the first thing on the dashboard: how much is safe to spend each day,
// what changed, and which budgets are running out.
export function InsightsTop({ date }: { date: string }) {
  const t = useT()
  const [d, setD] = useState<Insights | null>(null)
  const version = useEntriesVersion()
  useEffect(() => {
    getInsights(date).then(setD, () => setD(null))
  }, [date, version])
  if (!d) return null
  const safe = d.safe_per_day
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="rounded-sm bg-gradient-to-br from-[#0052d9] to-[#2b74f0] text-white">
          <CardContent className="grid gap-1">
            <p className="text-sm text-white/85 [&_button]:text-white/85"><Term k="safePerDay">{t("ins.safeTitle")}</Term></p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{fmtIDR(safe.amount)}</p>
            <p className="text-xs text-white/85">
              {safe.days_left > 0
                ? t(safe.basis === "budget" ? "ins.safeBudget" : "ins.safeSurplus", { remaining: fmtIDR(safe.remaining), days: safe.days_left, date: fmtDate(d.period.end) })
                : t("ins.periodOver")}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-sm">
          <CardContent className="grid gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-4 text-amber-500" /> {t("ins.title")}</h2>
            {d.insights.length === 0 && d.budget_alerts.length === 0 && <p className="text-sm text-muted-foreground">{t("ins.none")}</p>}
            <ul className="grid gap-1.5 text-sm">
              {d.budget_alerts.map((a) => (
                <li key={a.account_id} className={cn("flex gap-2", a.level === "over" ? "text-rose-700" : "text-amber-800")}>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {a.level === "over"
                    ? t("ins.budgetOver", { name: a.name, amount: fmtIDR(a.actual - a.budget) })
                    : t("ins.budgetWarn", { name: a.name, percent: Math.round((a.actual / a.budget) * 100) })}
                </li>
              ))}
              {d.insights.map((i, k) => {
                const Icon = insightIcon[i.kind]
                return (
                  <li key={k} className="flex gap-2">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", i.kind === "category_down" || i.kind === "savings_up" ? "text-emerald-600" : "text-rose-600")} />
                    {insightText(t, i)}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-sm"><CardContent>
          <Donut caption={<Term k="expense">{t("ins.whereMoneyWent")}</Term>} total={d.expense_total} otherLabel={t("ins.other")}
            items={d.by_category.map((c) => ({ label: c.name, value: c.amount }))} />
        </CardContent></Card>
        <Card className="rounded-sm"><CardContent>
          <Bars caption={t("ins.daily")} head={[t("common.date"), t("dash.expense")]} compact={dayMonth}
            items={d.daily.map((x) => ({ label: x.date, value: x.expense }))} />
        </CardContent></Card>
      </div>
    </>
  )
}

const ratioTerm: Record<string, TermKey> = { emergency_months: "emergencyFund", debt_ratio: "debtRatio", savings_3: "savingsRate" }

function RatioCard({ id, r, value, rule }: { id: "emergency_months" | "debt_ratio" | "savings_3"; r: Ratio; value: string; rule: string }) {
  const t = useT()
  const tone = { good: "text-emerald-700 bg-emerald-50", warn: "text-amber-800 bg-amber-50", bad: "text-rose-700 bg-rose-50", none: "text-muted-foreground bg-muted" }[r.status]
  return (
    <Card className="rounded-sm">
      <CardContent className="grid gap-1.5">
        <p className="text-sm text-muted-foreground"><Term k={ratioTerm[id]}>{t(`health.${id}` as Key)}</Term></p>
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-semibold tabular-nums">{r.status === "none" ? "—" : value}</span>
          <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-medium", tone)}>{t(`health.status.${r.status}` as Key)}</span>
        </p>
        <p className="text-xs text-muted-foreground">{rule}</p>
      </CardContent>
    </Card>
  )
}

// TrendsAndHealth is the lower half of the dashboard: twelve periods and three ratios.
export function TrendsAndHealth({ date }: { date: string }) {
  const t = useT()
  const [trend, setTrend] = useState<TrendPoint[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const version = useEntriesVersion()
  useEffect(() => {
    getTrends(date).then(setTrend, () => {})
    getHealth(date).then(setHealth, () => {})
  }, [date, version])
  const pct = (v: number) => `${Math.round(v * 100)}%`
  // Categories with the most spending over the twelve periods, for the category trend.
  const top = trend
    ? Object.values(trend.flatMap((p) => p.by_category).reduce<Record<string, { name: string; total: number }>>((m, c) => {
        m[c.account_id] = { name: c.name, total: (m[c.account_id]?.total ?? 0) + c.amount }
        return m
      }, {})).sort((a, b) => b.total - a.total).slice(0, 3)
    : []
  return (
    <>
      {health && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t("health.title")}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <RatioCard id="emergency_months" r={health.emergency_months} value={t("health.months", { n: health.emergency_months.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}
              rule={t("health.emergencyRule", { cash: fmtIDR(health.cash), spend: fmtIDR(health.avg_expense) })} />
            <RatioCard id="debt_ratio" r={health.debt_ratio} value={pct(health.debt_ratio.value)}
              rule={t("health.debtRule", { pay: fmtIDR(health.avg_debt_payments), income: fmtIDR(health.avg_income) })} />
            <RatioCard id="savings_3" r={health.savings_3} value={pct(health.savings_3.value)}
              rule={t("health.savingsRule", {
                six: health.savings_6.status === "none" ? "—" : pct(health.savings_6.value),
                twelve: health.savings_12.status === "none" ? "—" : pct(health.savings_12.value),
              })} />
          </div>
          {health.periods < 3 && <p className="text-xs text-muted-foreground">{t("health.young", { n: health.periods })}</p>}
        </section>
      )}
      {trend && trend.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-sm"><CardContent>
            <Lines caption={<Term k="netWorth">{t("ins.netWorthTrend")}</Term>} labels={trend.map((p) => p.period.label)}
              series={[{ name: t("glossary.netWorth.label"), values: trend.map((p) => p.net_worth) }]} />
          </CardContent></Card>
          <Card className="rounded-sm"><CardContent>
            <Lines caption={t("ins.incomeExpenseTrend")} labels={trend.map((p) => p.period.label)}
              series={[
                { name: t("dash.income"), values: trend.map((p) => p.income) },
                { name: t("dash.expense"), values: trend.map((p) => p.expense) },
                ...top.map((c) => ({ name: c.name, values: trend.map((p) => p.by_category.find((x) => x.name === c.name)?.amount ?? 0) })),
              ]} />
          </CardContent></Card>
        </div>
      )}
    </>
  )
}
