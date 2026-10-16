import { Clock, Loader2, Lock, Pencil, Plus, Trash2, X } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"
import { AmountField, DateField, Field, SelectField, Status, accountOptions, toFormError, useForm, type FormError } from "@/components/field"
import { SelectPicker, fmtDate, useIsMobile } from "@/components/picker"
import { toast } from "@/components/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  ApiError,
  deleteSoon,
  editEntry,
  editLines,
  editLoan,
  getEntry,
  listAccounts,
  perContact,
  undoDelete,
  type Account,
  type Entry,
  type EntryDetail,
  type Line,
  type LoanType,
  type PostEntryInput,
  type Snapshot,
} from "@/lib/api"
import { t as tr, useT, type Key } from "@/lib/i18n"
import { cn, fmtIDR, toSen } from "@/lib/utils"
import { kindBadge, kinds } from "@/pages/transactions"

const total = (lines: Line[]) => lines.reduce((s, l) => s + l.debit, 0)
const rupiah = (sen: number) => (sen / 100).toLocaleString("id-ID") // what AmountField shows and toSen reads back
const isPerson = (l: Line) => perContact(l.code)

// loanShape reads a loan entry back into the form that made it (see loanLines in the Go service).
function loanShape(e: Entry) {
  const person = e.lines.find(isPerson)!
  const others = e.lines.filter((l) => !isPerson(l))
  if (e.kind === "loan") {
    const lent = e.lines.some((l) => l.code === "1101" && l.debit > 0)
    const money = others.find((l) => (lent ? l.credit > 0 : l.debit > 0))!
    const share = lent ? others.find((l) => l.debit > 0) : undefined
    return { type: (lent ? "talangan" : "pinjam") as LoanType, person, money, share, amount: money.debit + money.credit }
  }
  const money = others[0]
  return { type: (money.debit > 0 ? "lunas_masuk" : "lunas_keluar") as LoanType, person, money, share: undefined, amount: money.debit + money.credit }
}

// One line per field that changed, e.g. "Amount: Rp 50.000 → Rp 75.000".
function diff(before: Snapshot, after: Snapshot) {
  const out: [Key, string, string][] = []
  if (total(before.lines) !== total(after.lines)) out.push(["common.amount", fmtIDR(total(before.lines)), fmtIDR(total(after.lines))])
  if (before.entry_date !== after.entry_date) out.push(["common.date", fmtDate(before.entry_date), fmtDate(after.entry_date)])
  if (before.description !== after.description) out.push(["common.note", before.description || "—", after.description || "—"])
  const names = (s: Snapshot) => s.lines.map((l) => l.name).sort().join(", ")
  if (names(before) !== names(after)) out.push(["ed.accounts", names(before), names(after)])
  return out
}

function done(pending: boolean, close: () => void) {
  toast(tr(pending ? "ed.sentForApproval" : "ed.saved"))
  close()
}

function SimpleEdit({ e, accounts, onDone }: { e: Entry; accounts: Account[]; onDone: (pending: boolean) => void }) {
  const t = useT()
  const kind = e.kind as PostEntryInput["kind"]
  const rule = kinds[kind]
  const active = accounts.filter((a) => (a.is_active || e.lines.some((l) => l.account_id === a.id)) && !perContact(a.code))
  const [from, setFrom] = useState(e.lines.find((l) => l.credit > 0)?.account_id ?? "")
  const [to, setTo] = useState(e.lines.find((l) => l.debit > 0)?.account_id ?? "")
  const form = useForm(async (v) => {
    const amount = toSen(v.amount)
    if (!(amount > 0)) throw new ApiError(400, "validation failed", undefined, "validation", { amount: "positiveAmount" })
    const r = await editEntry(e.id, { kind, entry_date: v.entry_date, amount, from_account_id: from, to_account_id: to, description: v.description, ...(e.period_date && { next_period: true }) })
    onDone(r.pending)
    return ""
  })
  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-4">
      <Status err={form.err} ok="" />
      <AmountField name="amount" label={t("common.amount")} defaultValue={rupiah(total(e.lines))} error={form.err.fields?.amount} />
      <DateField name="entry_date" label={t("common.date")} defaultValue={e.entry_date} error={form.err.fields?.entry_date} />
      <SelectField name="from" label={t(rule.fromLabel)} value={from} onChange={setFrom} options={accountOptions(active.filter((a) => a.type === rule.from))} error={form.err.fields?.from_account_id} />
      <SelectField name="to" label={t(rule.toLabel)} value={to} onChange={setTo} options={accountOptions(active.filter((a) => a.type === rule.to))} error={form.err.fields?.to_account_id} />
      <Field name="description" label={t("common.note")} defaultValue={e.description} error={form.err.fields?.description} />
      <SaveButton busy={form.busy} />
    </form>
  )
}

function LoanEdit({ e, accounts, onDone }: { e: Entry; accounts: Account[]; onDone: (pending: boolean) => void }) {
  const t = useT()
  const s = loanShape(e)
  const money = accounts.filter((a) => (a.is_active || a.id === s.money.account_id) && a.type === "Asset" && !perContact(a.code))
  const expenses = accounts.filter((a) => (a.is_active || a.id === s.share?.account_id) && a.type === "Expense")
  // A repayment that already went past the debt was confirmed once; keep that answer.
  const overpaid = e.kind === "repayment" && e.lines.filter(isPerson).length > 1
  const form = useForm(async (v) => {
    const amount = toSen(v.amount)
    const myShare = v.my_share ? toSen(v.my_share) : 0
    if (!(amount > 0)) throw new ApiError(400, "validation failed", undefined, "validation", { amount: "positiveAmount" })
    const r = await editLoan(e.id, {
      type: s.type,
      contact_id: s.person.contact_id!,
      account_id: v.account_id,
      amount,
      entry_date: v.entry_date,
      description: v.description,
      confirm_overpay: overpaid,
      ...(s.type === "talangan" && myShare > 0 ? { my_share: myShare, expense_account_id: v.expense_account_id } : {}),
    })
    onDone(r.pending)
    return ""
  })
  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t(`ct.types.${s.type}.label`)} · {s.person.contact_name}</p>
      <Status err={form.err} ok="" />
      <AmountField name="amount" label={t("ct.amountRp")} defaultValue={rupiah(s.amount)} error={form.err.fields?.amount} />
      <DateField name="entry_date" label={t("common.date")} defaultValue={e.entry_date} error={form.err.fields?.entry_date} />
      <SelectField name="account_id" label={t(s.type === "talangan" || s.type === "lunas_keluar" ? "ct.paidFrom" : "ct.receivedInto")}
        defaultValue={s.money.account_id} options={accountOptions(money)} error={form.err.fields?.account_id} />
      {s.type === "talangan" && (
        <>
          <AmountField name="my_share" label={t("ct.myShare")} defaultValue={s.share ? rupiah(s.share.debit) : ""} placeholder="0" error={form.err.fields?.my_share} />
          <SelectField name="expense_account_id" label={t("ct.myShareOn")} defaultValue={s.share?.account_id ?? expenses[0]?.id} options={accountOptions(expenses)} error={form.err.fields?.expense_account_id} />
        </>
      )}
      <Field name="description" label={t("common.note")} defaultValue={e.description} error={form.err.fields?.description} />
      <SaveButton busy={form.busy} />
    </form>
  )
}

type Row = { key: number; account_id: string; contact_id: string | null; debit: string; credit: string }

// LinesEdit is the line-by-line editor for cash counts and adjustments.
function LinesEdit({ e, accounts, onDone }: { e: Entry; accounts: Account[]; onDone: (pending: boolean) => void }) {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(() =>
    e.lines.map((l, key) => ({ key, account_id: l.account_id, contact_id: l.contact_id, debit: l.debit ? rupiah(l.debit) : "", credit: l.credit ? rupiah(l.credit) : "" })),
  )
  const options = accountOptions(accounts.filter((a) => (a.is_active && !perContact(a.code)) || rows.some((r) => r.account_id === a.id)))
  const sen = (s: string) => (s.trim() ? toSen(s) : 0)
  const dr = rows.reduce((s, r) => s + sen(r.debit), 0)
  const cr = rows.reduce((s, r) => s + sen(r.credit), 0)
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const form = useForm(async (v) => {
    if (rows.some((r) => !(sen(r.debit) >= 0 && sen(r.credit) >= 0))) throw new ApiError(400, tr("field.invalid"))
    const r = await editLines(e.id, {
      entry_date: v.entry_date,
      description: v.description,
      lines: rows.map((r) => ({ account_id: r.account_id, contact_id: r.contact_id, debit: sen(r.debit), credit: sen(r.credit) })),
    })
    onDone(r.pending)
    return ""
  })
  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-4">
      <Status err={form.err} ok="" />
      <DateField name="entry_date" label={t("common.date")} defaultValue={e.entry_date} error={form.err.fields?.entry_date} />
      <Field name="description" label={t("common.note")} defaultValue={e.description} error={form.err.fields?.description} />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{t("ed.lines")}</legend>
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-sm border p-2">
            <SelectPicker aria-label={t("ed.account", { n: i + 1 })} title={t("ed.account", { n: i + 1 })} value={r.account_id}
              onChange={(account_id) => set(r.key, { account_id })} options={options} placeholder={t("common.choose")} className="col-span-2" />
            <Button type="button" variant="ghost" size="icon" aria-label={t("ed.removeLine", { n: i + 1 })} disabled={rows.length <= 2}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <X />
            </Button>
            <Input inputMode="decimal" aria-label={t("ed.debitOf", { n: i + 1 })} placeholder={t("glossary.debit.label")} value={r.debit}
              onInput={(ev) => set(r.key, { debit: ev.currentTarget.value })} className="h-11 rounded-sm md:h-9" />
            <Input inputMode="decimal" aria-label={t("ed.creditOf", { n: i + 1 })} placeholder={t("glossary.credit.label")} value={r.credit}
              onInput={(ev) => set(r.key, { credit: ev.currentTarget.value })} className="h-11 rounded-sm md:h-9" />
          </div>
        ))}
        <Button type="button" variant="outline" className="rounded-sm"
          onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((x) => x.key)) + 1, account_id: "", contact_id: null, debit: "", credit: "" }])}>
          <Plus /> {t("ed.addLine")}
        </Button>
        <p className={cn("text-sm tabular-nums", dr === cr ? "text-muted-foreground" : "text-rose-700")}>
          {t("ed.totals", { dr: fmtIDR(dr), cr: fmtIDR(cr) })}{dr !== cr && ` · ${t("ed.unbalanced")}`}
        </p>
      </fieldset>
      <SaveButton busy={form.busy} disabled={dr !== cr || dr === 0} />
    </form>
  )
}

function SaveButton({ busy, disabled }: { busy: boolean; disabled?: boolean }) {
  const t = useT()
  return (
    <Button type="submit" disabled={busy || disabled} className="h-11 rounded-sm">
      {busy && <Loader2 className="animate-spin" />}
      {t("common.save")}
    </Button>
  )
}

function View({ d, onEdit, onDelete }: { d: EntryDetail; onEdit: () => void; onDelete: () => void }) {
  const t = useT()
  const e = d.entry
  // An approved shared loan lives in two books: deleting it would leave the other one wrong.
  const locked = d.mirrored || d.loan_status === "approved"
  const person = e.lines.find((l) => l.contact_name)?.contact_name
  return (
    <div className="grid gap-4 pb-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className={cn("rounded-sm", kindBadge[e.kind] ?? "bg-muted text-foreground")}>{t(`kind.${e.kind}` as Key)}</Badge>
        <span className="text-muted-foreground">#{e.entry_no} · {fmtDate(e.entry_date)}</span>
      </div>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">{fmtIDR(total(e.lines))}</p>
      {e.description && <p>{e.description}</p>}

      {d.loan_status === "pending" && <Note icon={Clock}>{t("ed.loanPending", { name: person ?? "" })}</Note>}
      {d.change_pending && <Note icon={Clock}>{t("ed.changePending")}</Note>}
      {d.mirrored && <Note icon={Lock}>{t("ed.mirrored")}</Note>}

      <table className="w-full text-sm tabular-nums [&_td]:py-1.5">
        <thead className="text-left text-xs text-muted-foreground">
          <tr><th className="font-normal">{t("rec.account")}</th><th className="text-right font-normal">{t("glossary.debit.label")}</th><th className="text-right font-normal">{t("glossary.credit.label")}</th></tr>
        </thead>
        <tbody className="divide-y">
          {e.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.code} · {l.name}{l.contact_name && <span className="text-muted-foreground"> ({l.contact_name})</span>}</td>
              <td className="text-right">{l.debit ? fmtIDR(l.debit) : ""}</td>
              <td className="text-right">{l.credit ? fmtIDR(l.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-2">
        {e.kind === "opening" ? (
          <Button asChild variant="outline" className="flex-1 rounded-sm"><a href="/app/opening"><Pencil /> {t("common.edit")}</a></Button>
        ) : (
          <Button variant="outline" className="flex-1 rounded-sm" disabled={d.change_pending} onClick={onEdit}><Pencil /> {t("common.edit")}</Button>
        )}
        {e.kind !== "opening" && (
          <Button variant="ghost" className="rounded-sm text-rose-700 hover:text-rose-800" disabled={locked} onClick={onDelete}
            title={locked ? t("errors.entry_locked") : undefined}>
            <Trash2 /> {t("common.delete")}
          </Button>
        )}
      </div>

      {d.revisions && d.revisions.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{t("ed.history")}</h3>
          <ol className="grid gap-2">
            {d.revisions.map((r, i) => (
              <li key={i} className="rounded-sm bg-muted/60 p-3 text-sm">
                <p className="text-xs text-muted-foreground">{t("ed.changedBy", { name: r.changed_by, date: fmtDate(r.changed_at.slice(0, 10)) })}</p>
                {diff(r.before, r.after).map(([k, a, b]) => (
                  <p key={k}><span className="text-muted-foreground">{t(k)}:</span> <s className="text-muted-foreground">{a}</s> → {b}</p>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function Note({ icon: Icon, children }: { icon: typeof Clock; children: ComponentChildren }) {
  return (
    <p className="flex gap-2 rounded-sm bg-amber-50 p-3 text-sm text-amber-900">
      <Icon className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

// EntryDetailSheet shows one entry, its history, and the edit form that fits its kind.
export function EntryDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT()
  const mobile = useIsMobile()
  const [d, setD] = useState<EntryDetail | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    setD(null)
    setEditing(false)
    setErr({})
    if (!id) return
    getEntry(id).then(setD).catch((e) => setErr(toFormError(e)))
    listAccounts().then(setAccounts).catch(() => {})
  }, [id])

  function remove(e: Entry) {
    onClose()
    deleteSoon(e.id).catch((x) => toast(toFormError(x).message ?? "", { tone: "error" }))
    toast(t("ed.deleted", { no: e.entry_no }), { action: { label: t("common.undo"), run: () => undoDelete(e.id) } })
  }

  const kind = d?.entry.kind
  const Form = kind === "loan" || kind === "repayment" ? LoanEdit : kind === "cash_count" || kind === "adjustment" ? LinesEdit : SimpleEdit
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={mobile ? "bottom" : "right"} title={editing ? t("ed.editTitle") : t("ed.title")}>
        <Status err={err} ok="" />
        {!d && !err.message && <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />}
        {d && !editing && <View d={d} onEdit={() => setEditing(true)} onDelete={() => remove(d.entry)} />}
        {d && editing && (
          <div className="grid gap-3 pb-2">
            {d.loan_status === "approved" && !d.mirrored && <Note icon={Clock}>{t("ed.needsApproval")}</Note>}
            <Form e={d.entry} accounts={accounts} onDone={(pending) => done(pending, onClose)} />
            <Button variant="ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
