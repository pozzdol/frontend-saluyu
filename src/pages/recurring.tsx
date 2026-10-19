import { AlertTriangle, Check, Loader2, Pencil, Plus, Repeat, Trash2 } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList } from "@/components/app-shell"
import { AmountField, DateField, Field, SelectField, Status, accountOptions, toFormError, useForm, type FormError } from "@/components/field"
import { SelectPicker, fmtDate } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import { Loading, SkeletonRows } from "@/components/skeleton"
import { toast } from "@/components/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  ApiError,
  confirmDue,
  deleteRecurring,
  listAccounts,
  listDue,
  listRecurring,
  perContact,
  saveRecurring,
  skipDue,
  useEntriesVersion,
  type Account,
  type DueOccurrence,
  type RecurringRule,
} from "@/lib/api"
import { intlLocale, t as tr, useT } from "@/lib/i18n"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"
import { kinds } from "@/pages/transactions"

type Kind = RecurringRule["kind"]

const weekday = (d: number) => new Intl.DateTimeFormat(intlLocale(), { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + d)))

// "Every Monday", "Every month on the 5th", "Every payday".
export function patternText(r: Pick<RecurringRule, "frequency" | "day">) {
  switch (r.frequency) {
    case "weekly":
      return tr("rcr.everyWeekday", { day: weekday(r.day ?? 0) })
    case "monthly":
      return tr("rcr.everyMonthDay", { day: r.day ?? 1 })
    case "payday":
      return tr("rcr.everyPayday")
  }
  return tr("rcr.everyDay")
}

const rupiah = (sen: number) => (sen / 100).toLocaleString("id-ID")

function DueItem({ d, onDone }: { d: DueOccurrence; onDone: () => void }) {
  const t = useT()
  const [amount, setAmount] = useState(rupiah(d.rule.amount))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})
  async function act(post: boolean) {
    setBusy(true)
    setErr({})
    try {
      if (post) {
        const sen = toSen(amount)
        if (!(sen > 0)) throw new ApiError(400, tr("field.positiveAmount"))
        await confirmDue(d.rule.id, { due_date: d.due_date, ...(sen !== d.rule.amount && { amount: sen }) })
        toast(t("rcr.recorded", { name: d.rule.name }))
      } else {
        await skipDue(d.rule.id, d.due_date)
      }
      onDone()
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="grid gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="font-medium">{d.rule.name}</span>
        <span className="text-muted-foreground">{fmtDate(d.due_date)}</span>
        {d.rule.last_error && <span className="flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="size-3.5" />{t("rcr.autoFailed")}</span>}
      </div>
      <Status err={err} ok="" />
      <div className="flex gap-2">
        <Input inputMode="decimal" aria-label={t("rcr.amountFor", { name: d.rule.name })} value={amount}
          onInput={(e) => setAmount(e.currentTarget.value)} className="h-11 min-w-0 flex-1 rounded-sm text-right tabular-nums md:h-9 md:max-w-48" />
        <Button className="h-11 rounded-sm md:h-9" disabled={busy} onClick={() => act(true)}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} {t("rcr.record")}
        </Button>
        <Button variant="ghost" className="h-11 md:h-9" disabled={busy} onClick={() => act(false)}>{t("rcr.skip")}</Button>
      </div>
    </li>
  )
}

// DueList shows occurrences waiting for a confirm; it hides itself when there are none.
export function DueList({ always = false }: { always?: boolean }) {
  const t = useT()
  const [due, setDue] = useState<DueOccurrence[] | null>(null)
  const [reload, setReload] = useState(0)
  const version = useEntriesVersion()
  useEffect(() => {
    listDue().then(setDue, () => setDue([]))
  }, [reload, version])
  if (!due || (due.length === 0 && !always)) return null
  return (
    <section className="grid gap-2">
      <h2 className="flex items-center gap-2 font-semibold"><Repeat className="size-4 text-primary" /> {t("rcr.ready")}{due.length > 0 && ` (${due.length})`}</h2>
      {due.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rcr.nothingDue")}</p>
      ) : (
        <ul className="divide-y rounded-sm border bg-card">
          {due.map((d) => <DueItem key={`${d.rule.id}-${d.due_date}`} d={d} onDone={() => setReload((n) => n + 1)} />)}
        </ul>
      )}
    </section>
  )
}

function RuleForm({ rule, accounts, onDone }: { rule?: RecurringRule; accounts: Account[]; onDone: () => void }) {
  const t = useT()
  const [kind, setKind] = useState<Kind>(rule?.kind ?? "expense")
  const [frequency, setFrequency] = useState<RecurringRule["frequency"]>(rule?.frequency ?? "monthly")
  const [day, setDay] = useState(String(rule?.day ?? 1))
  const [mode, setMode] = useState<RecurringRule["mode"]>(rule?.mode ?? "remind")
  const fits = kinds[kind]
  const active = accounts.filter((a) => a.is_active && !perContact(a.code))
  const fromOptions = active.filter(fits.from)
  const toOptions = active.filter(fits.to)
  const [from, setFrom] = useState(rule?.from_account_id ?? "")
  const [to, setTo] = useState(rule?.to_account_id ?? "")
  // The money account defaults to the first one; the category or source waits for a choice,
  // so "Netflix" never lands in Transportasi because that happened to be first.
  useEffect(() => {
    if (!fromOptions.some((a) => a.id === from)) setFrom(kind === "income" ? "" : fromOptions[0]?.id ?? "")
    if (!toOptions.some((a) => a.id === to)) setTo(kind === "income" ? toOptions[0]?.id ?? "" : "")
  }, [kind, accounts])

  const form = useForm(async (v) => {
    const amount = toSen(v.amount)
    if (!(amount > 0)) throw new ApiError(400, "validation failed", undefined, "validation", { amount: "positiveAmount" })
    if (!from || !to) throw new ApiError(400, "validation failed", undefined, "validation", { ...(!from && { from_account_id: "choose" }), ...(!to && { to_account_id: "choose" }) })
    await saveRecurring({
      name: v.name, kind, from_account_id: from, to_account_id: to, amount, frequency,
      day: frequency === "weekly" || frequency === "monthly" ? Number(day) : null,
      mode, start_date: v.start_date, end_date: v.end_date || null,
    }, rule?.id)
    onDone()
    toast(t("rcr.saved", { name: v.name }))
    return ""
  })

  const dayOptions = frequency === "weekly"
    ? [0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: weekday(d) }))
    : Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: t(i >= 28 ? "rcr.dayOrEnd" : "rcr.dayN", { n: i + 1 }) }))

  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><Status err={form.err} ok="" /></div>
      <Segmented label={t("tx.type")} value={kind} onChange={setKind} className="md:col-span-2"
        items={(["expense", "income", "transfer"] as Kind[]).map((k) => ({ value: k, label: t(k === "expense" ? "qa.out" : k === "income" ? "qa.in" : "qa.move") }))} />
      <Field name="name" label={t("rcr.name")} defaultValue={rule?.name} placeholder={kind === "income" ? "Gaji" : "Netflix"} error={form.err.fields?.name} />
      <AmountField name="amount" label={t("common.amount")} defaultValue={rule ? rupiah(rule.amount) : ""} error={form.err.fields?.amount} />
      <SelectField name="from" label={t(fits.fromLabel)} value={from} onChange={setFrom} options={accountOptions(fromOptions)} error={form.err.fields?.from_account_id} />
      <SelectField name="to" label={t(fits.toLabel)} value={to} onChange={setTo} options={accountOptions(toOptions)} error={form.err.fields?.to_account_id} />
      <SelectField name="frequency" label={t("rcr.repeat")} value={frequency} onChange={(f) => (setFrequency(f as RecurringRule["frequency"]), setDay("1"))}
        options={(["daily", "weekly", "monthly", "payday"] as const).map((f) => ({ value: f, label: t(`rcr.freq.${f}`) }))} />
      {(frequency === "weekly" || frequency === "monthly") && (
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium">{frequency === "weekly" ? t("rcr.weekday") : t("rcr.monthDay")}</span>
          <SelectPicker aria-label={t("rcr.weekday")} title={t("rcr.repeat")} value={day} onChange={setDay} options={dayOptions} />
        </div>
      )}
      <div className="grid gap-1.5 md:col-span-2">
        <span className="text-sm font-medium">{t("rcr.mode")}</span>
        <Segmented label={t("rcr.mode")} value={mode} onChange={setMode}
          items={[{ value: "remind", label: t("rcr.modeRemind") }, { value: "auto", label: t("rcr.modeAuto") }]} />
        <span className="text-xs text-muted-foreground">{t(mode === "remind" ? "rcr.remindHint" : "rcr.autoHint")}</span>
      </div>
      <DateField name="start_date" label={t("rcr.start")} defaultValue={rule?.next_date ?? todayISO()} error={form.err.fields?.start_date} />
      <DateField name="end_date" label={t("rcr.end")} defaultValue={rule?.end_date ?? ""} clearable placeholder={t("rcr.noEnd")} />
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

export function RecurringPage() {
  const t = useT()
  const [rules, setRules] = useState<RecurringRule[] | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [editing, setEditing] = useState<RecurringRule | "new" | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)
  useEffect(() => {
    Promise.all([listRecurring(), listAccounts()]).then(([r, a]) => (setRules(r), setAccounts(a)), (e) => setErr(toFormError(e)))
  }, [reload])
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? ""
  const done = () => (setEditing(null), setReload((n) => n + 1))

  // Delete at once with Undo, the same as a transaction: Undo saves the schedule again.
  async function remove(r: RecurringRule) {
    try {
      await deleteRecurring(r.id)
      done()
      const { name, kind, from_account_id, to_account_id, amount, frequency, day, mode, next_date, end_date } = r
      toast(t("rcr.deleted", { name }), {
        action: { label: t("common.undo"), run: () => saveRecurring({ name, kind, from_account_id, to_account_id, amount, frequency, day, mode, start_date: next_date, end_date }).then(done, (e) => setErr(toFormError(e))) },
      })
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  return (
    <AppShell title={t("nav.recurring")}>
      <div className="grid gap-6">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("rcr.intro")}</p>
        <Status err={err} ok="" />
        <DueList always />
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("rcr.rules")}</h2>
            {editing === null && <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setEditing("new")}><Plus /> {t("rcr.add")}</Button>}
          </div>
          {editing !== null && (
            <Card className="rounded-sm"><CardContent>
              <RuleForm key={editing === "new" ? "new" : editing.id} rule={editing === "new" ? undefined : editing} accounts={accounts} onDone={done} />
            </CardContent></Card>
          )}
          {!rules && !err.message && <Loading><SkeletonRows rows={3} cols={["text", "short", "amount"]} /></Loading>}
          {rules && (
            <MobileList empty={rules.length === 0 ? t("rcr.none") : undefined} className="md:block">
              {rules.map((r) => (
                <MobileItem key={r.id} title={r.name}
                  meta={<>
                    <span>{patternText(r)}</span>
                    <Badge className={cn("rounded-sm", r.mode === "auto" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700")}>
                      {t(r.mode === "auto" ? "rcr.modeAuto" : "rcr.modeRemind")}
                    </Badge>
                    <span>{t("rcr.next", { date: fmtDate(r.next_date) })}</span>
                    <span className="w-full truncate">{name(r.from_account_id)} → {name(r.to_account_id)}</span>
                    {r.last_error && <span className="w-full text-amber-800">{t("rcr.autoFailed")}: {r.last_error}</span>}
                  </>}
                  value={fmtIDR(r.amount)}
                  actions={
                    <span className="flex">
                      <Button variant="ghost" size="icon-sm" aria-label={t("rcr.editRule", { name: r.name })} title={t("rcr.editRule", { name: r.name })} onClick={() => setEditing(r)}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("rcr.deleteRule", { name: r.name })} title={t("rcr.deleteRule", { name: r.name })} onClick={() => remove(r)}><Trash2 /></Button>
                    </span>
                  } />
              ))}
            </MobileList>
          )}
        </section>
      </div>
    </AppShell>
  )
}
