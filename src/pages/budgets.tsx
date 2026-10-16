import { Loader2 } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileList, TableCard } from "@/components/app-shell"
import { Status, toFormError, useForm, type FormError } from "@/components/field"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError, getBudgets, putBudget, type BudgetList, type BudgetRow } from "@/lib/api"
import { fmtIDR, toSen } from "@/lib/utils"

function useBudgetForm(row: BudgetRow, date: string, onSaved: (r: BudgetRow) => void) {
  return useForm(async (v) => {
    const amount = toSen(v.amount)
    if (!(amount >= 0)) throw new ApiError(400, "validation failed", { amount: "must be zero or more" })
    onSaved(await putBudget(row.account_id, { date, amount }))
    return "Saved."
  })
}

function Editor({ row, form }: { row: BudgetRow; form: ReturnType<typeof useBudgetForm> }) {
  return (
    <form onSubmit={form.onSubmit} noValidate className="flex items-center justify-end gap-2">
      <Input
        name="amount"
        aria-label={`${row.name} budget (Rp)`}
        aria-invalid={!!form.err.fields?.amount}
        inputMode="decimal"
        key={row.budget}
        defaultValue={String(row.budget / 100)}
        className="h-11 min-w-0 flex-1 rounded-sm text-right tabular-nums md:h-9 md:w-36 md:flex-none"
      />
      <Button type="submit" size="sm" disabled={form.busy} className="rounded-sm">
        {form.busy && <Loader2 className="animate-spin" />}
        Save
      </Button>
      <span role="status" className="hidden w-24 text-xs text-muted-foreground md:inline">
        {form.ok || form.err.message || (form.err.fields?.amount ? `Amount ${form.err.fields.amount}` : "")}
      </span>
    </form>
  )
}

function Row({ row, date, onSaved }: { row: BudgetRow; date: string; onSaved: (r: BudgetRow) => void }) {
  const form = useBudgetForm(row, date, onSaved)
  return (
    <tr>
      <td>
        {row.name}
        {row.inherited && <Badge className="ml-2 rounded-sm bg-[#eaf2ff] text-primary">Inherited</Badge>}
      </td>
      <td className="text-right whitespace-nowrap tabular-nums">{fmtIDR(row.actual)}</td>
      <td><Editor row={row} form={form} /></td>
    </tr>
  )
}

function Card({ row, date, onSaved }: { row: BudgetRow; date: string; onSaved: (r: BudgetRow) => void }) {
  const form = useBudgetForm(row, date, onSaved)
  const message = form.ok || form.err.message || (form.err.fields?.amount ? `Amount ${form.err.fields.amount}` : "")
  return (
    <li className="grid gap-2 px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{row.name}</span>
        {row.inherited && <Badge className="rounded-sm bg-[#eaf2ff] text-primary">Inherited</Badge>}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">Spent {fmtIDR(row.actual)}</span>
      </div>
      <Editor row={row} form={form} />
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </li>
  )
}

export function BudgetsPage() {
  const [date, setDate] = usePeriodDate()
  const [list, setList] = useState<BudgetList | null>(null)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    getBudgets(date).then((r) => (setErr({}), setList(r))).catch((e) => setErr(toFormError(e)))
  }, [date])

  const saved = (r: BudgetRow) => setList((l) => l && { ...l, rows: l.rows.map((x) => (x.account_id === r.account_id ? r : x)) })

  return (
    <AppShell title="Budgets" actions={<PeriodPicker period={list?.period} onChange={setDate} />}>
      <div className="grid gap-4">
        <Status err={err} ok="" />
        <p className="text-sm text-muted-foreground">
          A budget carries over to every following period until you change it. Changing it here only affects this period and later ones.
        </p>
        {list && (
          <MobileList empty={list.rows.length === 0 ? "No expense accounts yet." : undefined}>
            {list.rows.map((r) => <Card key={r.account_id} row={r} date={list.period.start} onSaved={saved} />)}
          </MobileList>
        )}
        {list && (
          <TableCard className="hidden md:block">
            <thead>
              <tr>
                <th>Account</th>
                <th className="text-right!">Spent</th>
                <th className="text-right!">Budget (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => <Row key={r.account_id} row={r} date={list.period.start} onSaved={saved} />)}
              {list.rows.length === 0 && (
                <tr><td colSpan={3} className="py-8! text-center text-muted-foreground">No expense accounts yet.</td></tr>
              )}
            </tbody>
          </TableCard>
        )}
      </div>
    </AppShell>
  )
}
