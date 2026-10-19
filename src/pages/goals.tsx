import { Loader2, Pencil, Plus, Target, Trash2 } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AmountField, DateField, Field, SelectField, Status, accountOptions, toFormError, useForm, type FormError } from "@/components/field"
import { fmtDate } from "@/components/picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ApiError, deleteGoal, listAccounts, listGoals, perContact, saveGoal, useEntriesVersion, type Account, type Goal } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { toast } from "@/components/toast"
import { cn, fmtIDR, toSen } from "@/lib/utils"
import { Loading, SkeletonCards, SkeletonHeading } from "@/components/skeleton"

function GoalForm({ goal, accounts, onDone }: { goal?: Goal; accounts: Account[]; onDone: () => void }) {
  const t = useT()
  const holders = accounts.filter((a) => a.is_active && a.type === "Asset" && !perContact(a.code))
  const [account, setAccount] = useState(goal?.account_id ?? holders.find((a) => a.code === "1003")?.id ?? holders[0]?.id ?? "")
  const form = useForm(async (v) => {
    const target = toSen(v.target)
    if (!(target > 0)) throw new ApiError(400, "validation failed", undefined, "validation", { target: "positiveAmount" })
    await saveGoal({ name: v.name, target, deadline: v.deadline || null, account_id: account }, goal?.id)
    onDone()
    toast(t("goal.savedToast", { name: v.name }))
    return ""
  })
  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
      <h3 className="font-semibold md:col-span-2">{goal ? t("goal.editTitle", { name: goal.name }) : t("goal.newTitle")}</h3>
      <div className="md:col-span-2"><Status err={form.err} ok="" /></div>
      <Field name="name" label={t("goal.name")} placeholder={t("goal.namePlaceholder")} defaultValue={goal?.name} error={form.err.fields?.name} />
      <AmountField name="target" label={t("goal.target")} defaultValue={goal ? (goal.target / 100).toLocaleString("id-ID") : ""} error={form.err.fields?.target} />
      <DateField name="deadline" label={t("goal.deadline")} defaultValue={goal?.deadline ?? ""} clearable placeholder={t("goal.noDeadline")} />
      <SelectField name="account" label={t("goal.account")} value={account} onChange={setAccount} options={accountOptions(holders)} error={form.err.fields?.account_id} />
      <p className="text-xs text-muted-foreground md:col-span-2">{t("goal.accountHint")}</p>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={form.busy} className="h-10 rounded-sm">
          {form.busy && <Loader2 className="animate-spin" />}
          {t("common.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
      </div>
    </form>
  )
}

function GoalCard({ g, accountName, onEdit, onDelete }: { g: Goal; accountName: string; onEdit?: () => void; onDelete?: () => void }) {
  const t = useT()
  const pct = Math.min(100, (g.saved / g.target) * 100)
  const done = g.remaining === 0
  return (
    <Card className="rounded-sm">
      <CardContent className="grid gap-2">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{g.name}</p>
            <p className="text-xs text-muted-foreground">{accountName}{g.deadline && ` · ${t("goal.by", { date: fmtDate(g.deadline) })}`}</p>
          </div>
          {onEdit && <Button variant="ghost" size="icon-sm" aria-label={t("goal.edit", { name: g.name })} title={t("goal.edit", { name: g.name })} onClick={onEdit}><Pencil /></Button>}
          {onDelete && <Button variant="ghost" size="icon-sm" aria-label={t("goal.delete", { name: g.name })} title={t("goal.delete", { name: g.name })} onClick={onDelete}><Trash2 /></Button>}
        </div>
        <div role="meter" aria-label={t("goal.progress", { name: g.name })} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
          className="h-2 overflow-hidden rounded-sm bg-[#e6ebf5]">
          <div className={cn("h-full", done ? "bg-emerald-600" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        <p className="flex flex-wrap justify-between gap-x-3 text-sm tabular-nums">
          <span>{t("goal.savedOf", { saved: fmtIDR(g.saved), target: fmtIDR(g.target) })} ({Math.round(pct)}%)</span>
          <span className={cn("font-medium", done ? "text-emerald-700" : "text-muted-foreground")}>
            {done ? t("goal.reached") : g.monthly_needed !== null ? t("goal.perMonth", { amount: fmtIDR(g.monthly_needed), n: g.months_left ?? 1 }) : t("goal.left", { amount: fmtIDR(g.remaining) })}
          </span>
        </p>
      </CardContent>
    </Card>
  )
}

// Goals shows the goals with progress; manage adds the form and edit/delete buttons.
export function Goals({ manage = false }: { manage?: boolean }) {
  const t = useT()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [editing, setEditing] = useState<Goal | "new" | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)
  const version = useEntriesVersion()
  useEffect(() => {
    Promise.all([listGoals(), listAccounts()]).then(([g, a]) => (setGoals(g), setAccounts(a)), (e) => setErr(toFormError(e)))
  }, [reload, version])
  // Only the managing view is known to have goals; the dashboard embed stays absent until it knows.
  if (!goals && manage && !err.message) return <Loading><div className="grid gap-3"><SkeletonHeading /><SkeletonCards count={2} bar /></div></Loading>
  if (!goals || (!manage && goals.length === 0)) return null
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? ""
  const done = () => (setEditing(null), setReload((n) => n + 1))
  // Delete with Undo, like everything else that disappears: Undo saves the goal again.
  const remove = (g: Goal) => deleteGoal(g.id).then(() => {
    done()
    toast(t("goal.deletedToast", { name: g.name }), {
      action: { label: t("common.undo"), run: () => saveGoal({ name: g.name, target: g.target, deadline: g.deadline, account_id: g.account_id }).then(done, (e) => setErr(toFormError(e))) },
    })
  }, (e) => setErr(toFormError(e)))
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("goal.title")}</h2>
        {manage && editing === null && <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setEditing("new")}><Plus /> {t("goal.add")}</Button>}
        {!manage && <a href="/app/budgets" className="text-sm text-primary hover:underline">{t("goal.manage")}</a>}
      </div>
      <Status err={err} ok="" />
      {editing === "new" && (
        <Card className="rounded-sm"><CardContent>
          <GoalForm key="new" accounts={accounts} onDone={done} />
        </CardContent></Card>
      )}
      {goals.length === 0 && <p className="text-sm text-muted-foreground">{t("goal.none")}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((g) => editing !== null && editing !== "new" && editing.id === g.id ? (
          <Card key={g.id} className="rounded-sm md:col-span-2"><CardContent>
            <GoalForm goal={g} accounts={accounts} onDone={done} />
          </CardContent></Card>
        ) : (
          <GoalCard key={g.id} g={g} accountName={name(g.account_id)}
            onEdit={manage ? () => setEditing(g) : undefined}
            onDelete={manage ? () => remove(g) : undefined} />
        ))}
      </div>
    </section>
  )
}
