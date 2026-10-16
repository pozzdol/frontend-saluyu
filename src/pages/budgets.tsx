import { Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileList, TableCard } from "@/components/app-shell"
import { AmountField, Field, Status, toFormError, useForm, type FormError } from "@/components/field"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { SelectPicker } from "@/components/picker"
import { Info } from "@/components/term"
import { toast } from "@/components/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card as UICard, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ApiError, createAccount, getBudgets, listAccounts, putBudget, type Account, type BudgetList, type BudgetRow } from "@/lib/api"
import { t, useT } from "@/lib/i18n"
import { fmtIDR, toSen } from "@/lib/utils"
import { Goals } from "@/pages/goals"

const NEW = "__new__" // the "new category" choice in the picker

// A category is "budgeted" when its budget is above zero. Removing a budget sets it to zero
// from this period on, so earlier periods keep the limits they had.
const budgeted = (r: BudgetRow) => r.budget > 0

function useBudgetForm(row: BudgetRow, date: string, onSaved: (r: BudgetRow) => void) {
  return useForm(async (v) => {
    const amount = toSen(v.amount)
    if (!(amount > 0)) throw new ApiError(400, "validation failed", undefined, "validation", { amount: "positiveAmount" })
    onSaved(await putBudget(row.account_id, { date, amount }))
    return t("common.saved")
  })
}

function Editor({ row, form, onRemove }: { row: BudgetRow; form: ReturnType<typeof useBudgetForm>; onRemove: () => void }) {
  return (
    <form onSubmit={form.onSubmit} noValidate className="flex items-center justify-end gap-2">
      <Input
        name="amount"
        aria-label={t("budget.inputLabel", { name: row.name })}
        aria-invalid={!!form.err.fields?.amount}
        inputMode="decimal"
        key={row.budget}
        defaultValue={(row.budget / 100).toLocaleString("id-ID")}
        className="h-11 min-w-0 flex-1 rounded-sm text-right tabular-nums md:h-9 md:w-36 md:flex-none"
      />
      <Button type="submit" size="sm" disabled={form.busy} className="rounded-sm">
        {form.busy && <Loader2 className="animate-spin" />}
        {t("common.save")}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("budget.remove", { name: row.name })} onClick={onRemove}>
        <Trash2 />
      </Button>
    </form>
  )
}

type RowProps = { row: BudgetRow; date: string; onSaved: (r: BudgetRow) => void; onRemove: () => void }

function Row({ row, date, onSaved, onRemove }: RowProps) {
  const form = useBudgetForm(row, date, onSaved)
  const message = form.ok || form.err.message || form.err.fields?.amount || ""
  return (
    <tr>
      <td>
        {row.name}
        {row.inherited && <Badge className="ml-2 rounded-sm bg-[#eaf2ff] text-primary">{t("budget.inherited")} <Info k="inherited" /></Badge>}
      </td>
      <td className="text-right whitespace-nowrap tabular-nums">{fmtIDR(row.actual)}</td>
      <td>
        <Editor row={row} form={form} onRemove={onRemove} />
        {message && <p role="status" className="mt-1 text-right text-xs text-muted-foreground">{message}</p>}
      </td>
    </tr>
  )
}

function Card({ row, date, onSaved, onRemove }: RowProps) {
  const form = useBudgetForm(row, date, onSaved)
  const message = form.ok || form.err.message || form.err.fields?.amount || ""
  return (
    <li className="grid gap-2 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{row.name}</span>
        {row.inherited && <Badge className="rounded-sm bg-[#eaf2ff] text-primary">{t("budget.inherited")} <Info k="inherited" /></Badge>}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{t("budget.spentAmount", { amount: fmtIDR(row.actual) })}</span>
      </div>
      <Editor row={row} form={form} onRemove={onRemove} />
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </li>
  )
}

// nextCode is the first free expense code before 5199 (kept for "other cash spending").
const nextCode = (accounts: Account[]) => {
  const used = new Set(accounts.map((a) => a.code))
  for (let n = 5101; n < 5199; n++) if (!used.has(String(n))) return String(n)
  return null
}

// AddBudget sets a limit for a category that has none yet, or for a brand new category.
function AddBudget({ rows, date, accounts, initial, onAdded, onCancel }: {
  rows: BudgetRow[]
  date: string
  accounts: Account[]
  initial?: string
  onAdded: (r: BudgetRow) => void
  onCancel: () => void
}) {
  const t = useT()
  const free = rows.filter((r) => !budgeted(r))
  const [choice, setChoice] = useState(initial ?? free[0]?.account_id ?? NEW)
  const form = useForm(async (v) => {
    const amount = toSen(v.amount)
    const fields: Record<string, string> = {}
    if (!(amount > 0)) fields.amount = "positiveAmount"
    if (choice === NEW && !v.name?.trim()) fields.name = "required"
    if (Object.keys(fields).length) throw new ApiError(400, "validation failed", undefined, "validation", fields)
    let accountId = choice
    if (choice === NEW) {
      const code = nextCode(accounts)
      if (!code) throw new ApiError(409, t("budget.noCode"))
      accountId = (await createAccount({ code, name: v.name.trim(), type: "Expense", category: "Beban" })).id
    }
    onAdded(await putBudget(accountId, { date, amount }))
    return ""
  })
  const options = [
    ...free.map((r) => ({ value: r.account_id, label: r.name, hint: r.actual > 0 ? t("budget.spentAmount", { amount: fmtIDR(r.actual) }) : undefined })),
    { value: NEW, label: t("budget.newCategory") },
  ]
  return (
    <UICard className="rounded-sm">
      <CardContent>
        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="md:col-span-3"><Status err={form.err} ok="" /></div>
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("budget.account")}</span>
            <SelectPicker aria-label={t("budget.account")} title={t("budget.account")} value={choice} onChange={setChoice} options={options} />
          </div>
          <AmountField name="amount" label={t("budget.amount")} placeholder="1.500.000" error={form.err.fields?.amount} />
          <div className="flex gap-2">
            <Button type="submit" disabled={form.busy} className="h-10 rounded-sm">
              {form.busy ? <Loader2 className="animate-spin" /> : <Plus />} {t("common.add")}
            </Button>
            <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>{t("common.cancel")}</Button>
          </div>
          {choice === NEW && (
            <div className="md:col-span-3">
              <Field name="name" label={t("budget.newName")} placeholder={t("budget.newPlaceholder")} error={form.err.fields?.name} />
            </div>
          )}
        </form>
      </CardContent>
    </UICard>
  )
}

export function BudgetsPage() {
  const t = useT()
  const [date, setDate] = usePeriodDate()
  const [list, setList] = useState<BudgetList | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [adding, setAdding] = useState<string | true | null>(null) // true = pick any, string = this category
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)

  useEffect(() => {
    Promise.all([getBudgets(date), listAccounts()])
      .then(([r, a]) => (setErr({}), setList(r), setAccounts(a)))
      .catch((e) => setErr(toFormError(e)))
  }, [date, reload])

  const saved = (r: BudgetRow) => setList((l) => l && { ...l, rows: l.rows.map((x) => (x.account_id === r.account_id ? r : x)) })

  async function remove(row: BudgetRow) {
    if (!list) return
    const start = list.period.start
    try {
      saved(await putBudget(row.account_id, { date: start, amount: 0 }))
      toast(t("budget.removed", { name: row.name }), {
        action: {
          label: t("common.undo"),
          run: () => putBudget(row.account_id, { date: start, amount: row.budget }).then(saved, (e) => setErr(toFormError(e))),
        },
      })
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  const rows = list?.rows.filter(budgeted) ?? []
  // Spending without a limit: a nudge to add one, not a list of every category.
  const unplanned = list?.rows.filter((r) => !budgeted(r) && r.actual > 0) ?? []
  const total = rows.reduce((s, r) => s + r.budget, 0)
  const spent = rows.reduce((s, r) => s + r.actual, 0)

  return (
    <AppShell title={t("budget.title")} term="budget" actions={<PeriodPicker period={list?.period} onChange={setDate} />}>
      <div className="grid gap-4">
        <Status err={err} ok="" />
        <p className="text-sm text-muted-foreground">{t("budget.intro")}</p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm tabular-nums">{rows.length > 0 && t("budget.summary", { spent: fmtIDR(spent), total: fmtIDR(total), n: rows.length })}</p>
          {adding === null && list && (
            <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setAdding(true)}><Plus /> {t("budget.add")}</Button>
          )}
        </div>
        {adding !== null && list && (
          <AddBudget key={String(adding)} rows={list.rows} date={list.period.start} accounts={accounts}
            initial={typeof adding === "string" ? adding : undefined}
            onAdded={(r) => (setAdding(null), setReload((n) => n + 1), toast(t("budget.added", { name: r.name })))}
            onCancel={() => setAdding(null)} />
        )}

        {list && (
          <MobileList empty={rows.length === 0 ? t("budget.none") : undefined}>
            {rows.map((r) => <Card key={r.account_id} row={r} date={list.period.start} onSaved={saved} onRemove={() => remove(r)} />)}
          </MobileList>
        )}
        {list && (
          <TableCard className="hidden md:block">
            <thead>
              <tr>
                <th>{t("budget.account")}</th>
                <th className="text-right!">{t("budget.spent")}</th>
                <th className="text-right!">{t("budget.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <Row key={r.account_id} row={r} date={list.period.start} onSaved={saved} onRemove={() => remove(r)} />)}
              {rows.length === 0 && (
                <tr><td colSpan={3} className="py-8! text-center text-muted-foreground">{t("budget.none")}</td></tr>
              )}
            </tbody>
          </TableCard>
        )}

        {unplanned.length > 0 && (
          <section className="grid gap-2 rounded-sm border border-dashed p-4">
            <h2 className="text-sm font-semibold">{t("budget.unplanned")}</h2>
            <ul className="grid gap-1 text-sm">
              {unplanned.map((r) => (
                <li key={r.account_id} className="flex items-center gap-2">
                  <span className="flex-1">{r.name}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtIDR(r.actual)}</span>
                  <Button variant="ghost" size="sm" onClick={() => setAdding(r.account_id)}><Plus /> {t("budget.limitIt")}</Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-4"><Goals manage /></div>
      </div>
    </AppShell>
  )
}
