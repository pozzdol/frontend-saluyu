import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Download, Loader2, SlidersHorizontal } from "lucide-react"
import { useEffect, useMemo, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
import { AmountField, CheckboxField, DateField, Field, SelectField, Status, accountOptions, toFormError, useForm, type FormError } from "@/components/field"
import { DatePicker, SelectPicker, fmtDate, useIsMobile } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  ApiError,
  downloadEntries,
  isFixedAsset,
  isMoney,
  perContact,
  listAccounts,
  listEntries,
  postEntry,
  deleteEntry,
  type Account,
  type Entry,
  type EntryQuery,
  type PostEntryInput,
  type User,
  useEntriesVersion,
  useHiddenEntries,
} from "@/lib/api"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"
import { Term } from "@/components/term"
import { t, useT, type Key } from "@/lib/i18n"
import { EntryDetailSheet } from "@/components/entry-detail"
import { toast } from "@/components/toast"

// daysBetween counts whole days from date a to date b (YYYY-MM-DD), DST-safe via UTC.
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)

type FormKind = PostEntryInput["kind"]

// Which account types each form moves money between. Mirrors kindRules in the Go service.
// Cards pay like a bank account; a transfer can also pay off a card or loan.
type Fits = (a: Account) => boolean
export const kinds: Record<FormKind, { label: Key; icon: typeof ArrowUpRight; from: Fits; to: Fits; fromLabel: Key; toLabel: Key }> = {
  expense: { label: "kind.expense", icon: ArrowUpRight, from: isMoney, to: (a) => a.type === "Expense", fromLabel: "tx.paidFrom", toLabel: "tx.category" },
  income: { label: "kind.income", icon: ArrowDownLeft, from: (a) => a.type === "Revenue", to: (a) => a.type === "Asset" && !isFixedAsset(a), fromLabel: "tx.source", toLabel: "tx.receivedInto" },
  transfer: { label: "kind.transfer", icon: ArrowLeftRight, from: isMoney, to: (a) => a.type === "Asset" || a.type === "Liability", fromLabel: "tx.from", toLabel: "tx.to" },
}

export const kindBadge: Record<string, string> = {
  income: "bg-emerald-50 text-emerald-700",
  expense: "bg-rose-50 text-rose-700",
  transfer: "bg-[#eaf2ff] text-primary",
  opening: "bg-violet-50 text-violet-700",
  cash_count: "bg-amber-50 text-amber-700",
  adjustment: "bg-slate-100 text-slate-700",
  loan: "bg-orange-50 text-orange-700",
  repayment: "bg-teal-50 text-teal-700",
  borrowing: "bg-amber-50 text-amber-800",
  installment: "bg-indigo-50 text-indigo-700",
}

// The same short words as Quick Add, so both ways of recording speak alike (and fit a phone).
const tabLabel: Record<FormKind, Key> = { expense: "qa.out", income: "qa.in", transfer: "qa.move" }

function EntryForm({ accounts, startDay, onPosted }: { accounts: Account[]; startDay: number; onPosted: () => void }) {
  const t = useT()
  const [kind, setKind] = useState<FormKind>("expense")
  const rule = kinds[kind]
  // 1101/2101 need a person: those go through the Contacts page instead.
  const active = accounts.filter((a) => a.is_active && !perContact(a.code))
  const fromOptions = active.filter(rule.from)
  const toOptions = active.filter(rule.to)
  const feeAccount = accounts.find((a) => a.code === "5107")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [date, setDate] = useState(todayISO())
  const [nextPeriod, setNextPeriod] = useState(false)

  // Salary often lands a few days before the period starts; offer to count it in the coming one.
  const nextStart = (() => {
    const [y, m, d] = date.split("-").map(Number)
    if (!y) return ""
    return new Date(Date.UTC(y, d < startDay ? m - 1 : m, startDay)).toISOString().slice(0, 10)
  })()
  const early = nextStart !== "" && daysBetween(date, nextStart) <= 3
  const showNext = kind === "income" && early

  // Reset the selection when the kind changes. The money account defaults to the first one; the
  // category, source or destination stays empty until chosen, so nothing is filed by accident.
  useEffect(() => {
    setFrom(kind === "income" ? "" : fromOptions[0]?.id ?? "")
    setTo(kind === "income" ? toOptions[0]?.id ?? "" : "")
  }, [kind, accounts])

  const form = useForm(async (v, el) => {
    const amount = toSen(v.amount)
    if (!(amount > 0)) throw new ApiError(400, "validation failed", undefined, "validation", { amount: "positiveAmount" })
    const fee = kind === "transfer" && v.fee ? toSen(v.fee) : 0
    if (!(fee >= 0)) throw new ApiError(400, "validation failed", undefined, "validation", { fee: "invalid" })
    if (!from || !to) throw new ApiError(400, "validation failed", undefined, "validation", { ...(!from && { from_account_id: "choose" }), ...(!to && { to_account_id: "choose" }) })
    const posted = await postEntry({ kind, entry_date: date, amount, from_account_id: from, to_account_id: to, description: v.description, ...(showNext && nextPeriod && { next_period: true }), ...(fee > 0 && feeAccount && { fee, fee_account_id: feeAccount.id }) })
    // Keep date and accounts for the next entry: people usually log several in a row.
    ;(el.elements.namedItem("amount") as HTMLInputElement).value = ""
    ;(el.elements.namedItem("description") as HTMLInputElement).value = ""
    const feeInput = el.elements.namedItem("fee") as HTMLInputElement | null
    if (feeInput) feeInput.value = ""
    setNextPeriod(false)
    onPosted()
    // Same feedback as Quick Add: a toast with Undo, not a green box that outlives the moment.
    toast(t("tx.savedUndo", { kind: t(rule.label), amount: fmtIDR(amount) }), {
      action: { label: t("common.undo"), run: () => deleteEntry(posted.id).then(() => (toast(t("qa.undone")), onPosted()), (x) => toast(toFormError(x).message ?? "", { tone: "error" })) },
    })
    return ""
  })
  const err = form.err

  return (
    <Card className="rounded-sm">
      <CardContent>
        <Segmented
          label={t("tx.type")}
          className="mb-5"
          value={kind}
          onChange={setKind}
          items={(Object.keys(kinds) as FormKind[]).map((k) => {
            const Icon = kinds[k].icon
            return { value: k, label: <><Icon className="size-4" />{t(tabLabel[k])}</> }
          })}
        />

        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-6">
            <Status err={err} ok={form.ok} />
          </div>
          <div className="md:col-span-2">
            <AmountField name="amount" label={t("common.amount")} placeholder="25.000" error={err.fields?.amount} />
          </div>
          <DateField name="entry_date" label={t("common.date")} value={date} onChange={setDate} error={err.fields?.entry_date} className="md:col-span-1" />
          <SelectField name="from" label={t(rule.fromLabel)} value={from} onChange={setFrom} options={accountOptions(fromOptions)} error={err.fields?.from_account_id} className="md:col-span-3" />
          <SelectField name="to" label={t(rule.toLabel)} value={to} onChange={setTo} options={accountOptions(toOptions.filter((a) => a.id !== from))} error={err.fields?.to_account_id} className="md:col-span-3" />
          <div className="md:col-span-3">
            <Field name="description" label={t("common.note")} placeholder={kind === "income" ? t("tx.notePlaceholderIncome") : t("tx.notePlaceholderExpense")} error={err.fields?.description} />
          </div>
          {kind === "transfer" && feeAccount && (
            <div className="md:col-span-3">
              <AmountField name="fee" label={t("tx.fee")} placeholder="0" error={err.fields?.fee} />
            </div>
          )}
          {showNext && (
            <div className="md:col-span-6">
              <CheckboxField
                name="next_period"
                label={t("tx.nextPeriod")}
                hint={t("tx.nextPeriodHint", { date: fmtDate(nextStart) })}
                checked={nextPeriod}
                onChange={setNextPeriod}
              />
            </div>
          )}
          <div className="flex items-end md:col-span-6">
            <Button type="submit" disabled={form.busy} className="h-10 w-full rounded-sm px-8 md:w-auto">
              {form.busy && <Loader2 className="animate-spin" />}
              {t("tx.saveKind", { kind: t(rule.label).toLowerCase() })}
            </Button>
          </div>
        </form>
        {kind === "income" && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("tx.refundHint", { account: accounts.find((a) => a.code === "4003")?.name ?? "Pengembalian" })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// amountOf is the size of an entry: its total debits (equal to its total credits).
const amountOf = (e: Entry) => e.lines.reduce((s, l) => s + l.debit, 0)

const kinds8 = ["income", "expense", "transfer", "loan", "repayment", "opening", "cash_count", "adjustment", "borrowing", "installment"] as const
const kindOptions = () => [{ value: "", label: t("tx.allTypes") }, ...kinds8.map((k) => ({ value: k, label: t(`kind.${k}`) }))]

// JournalFilters sit inline on desktop; on phones they live behind a "Filters" button in a
// bottom sheet so the list stays on screen.
function JournalFilters({ q, set, accounts }: { q: EntryQuery; set: (p: EntryQuery) => void; accounts: Account[] }) {
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const active = [q.q, q.kind, q.account_id, q.from, q.to, q.amount_min, q.amount_max].filter(Boolean).length
  // "75.000" in either box: an empty box means no bound; an unreadable one is ignored.
  const amount = (v: string) => {
    const sen = toSen(v)
    return v.trim() && sen >= 0 ? sen : undefined
  }
  const t = useT()
  const accountOpts = [{ value: "", label: t("tx.allAccounts") }, ...accountOptions(accounts)]

  const controls = (
    <>
      <Input
        type="search"
        placeholder={t("tx.searchNote")}
        aria-label={t("tx.searchNote")}
        defaultValue={q.q ?? ""}
        className="h-11 rounded-sm bg-white md:h-9 md:w-44"
        onChange={(e) => set({ q: (e.target as HTMLInputElement).value })}
      />
      <SelectPicker aria-label={t("tx.type")} title={t("tx.type")} value={q.kind ?? ""} options={kindOptions()} onChange={(v) => set({ kind: v })} className="bg-white md:h-9 md:w-40" />
      <SelectPicker aria-label={t("tx.allAccounts")} title={t("tx.allAccounts")} value={q.account_id ?? ""} options={accountOpts} onChange={(v) => set({ account_id: v })} className="bg-white md:h-9 md:w-52" />
      <Input inputMode="decimal" placeholder={t("tx.amountMin")} aria-label={t("tx.amountMin")} defaultValue={q.amount_min ? String(q.amount_min / 100) : ""}
        className="h-11 rounded-sm bg-white md:h-9 md:w-32" onChange={(e) => set({ amount_min: amount((e.target as HTMLInputElement).value) })} />
      <Input inputMode="decimal" placeholder={t("tx.amountMax")} aria-label={t("tx.amountMax")} defaultValue={q.amount_max ? String(q.amount_max / 100) : ""}
        className="h-11 rounded-sm bg-white md:h-9 md:w-32" onChange={(e) => set({ amount_max: amount((e.target as HTMLInputElement).value) })} />
      <DatePicker aria-label={t("tx.fromDate")} title={t("tx.fromDate")} placeholder={t("tx.from")} clearable value={q.from ?? ""} onChange={(v) => set({ from: v })} className="bg-white md:h-9 md:w-40" />
      <DatePicker aria-label={t("tx.toDate")} title={t("tx.toDate")} placeholder={t("tx.to")} clearable value={q.to ?? ""} onChange={(v) => set({ to: v })} className="bg-white md:h-9 md:w-40" />
    </>
  )

  if (!mobile) return <div className="flex flex-wrap items-center gap-2">{controls}</div>
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="rounded-sm bg-white">
          <SlidersHorizontal /> {t("common.filters")}{active > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{active}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" title={t("tx.filterJournal")}>
        <div className="grid gap-3 pb-2">
          {controls}
          <Button className="rounded-sm" onClick={() => setOpen(false)}>{t("common.showResults")}</Button>
          {active > 0 && (
            <Button variant="ghost" onClick={() => (set({ q: "", kind: "", account_id: "", from: "", to: "", amount_min: undefined, amount_max: undefined }), setOpen(false))}>{t("common.clearFilters")}</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function Transactions({ user }: { user: User }) {
  const t = useT()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [q, setQ] = useState<EntryQuery>({ page: 1, limit: 20 })
  const [data, setData] = useState<{ entries: Entry[]; total: number } | null>(null)
  const [loadErr, setLoadErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)
  const version = useEntriesVersion()
  const hidden = useHiddenEntries()
  const [openId, setOpenId] = useState<string | null>(null)
  const entries = data?.entries.filter((e) => !hidden.has(e.id))
  const total = data ? data.total - (data.entries.length - (entries?.length ?? 0)) : 0
  const filtered = [q.q, q.kind, q.account_id, q.from, q.to, q.amount_min, q.amount_max].some(Boolean)
  const empty = data && entries?.length === 0 ? t(filtered ? "tx.noMatch" : "tx.empty") : undefined
  const showBalance = !!q.account_id // the running balance only makes sense for one account
  const clearFilters = () => set({ q: "", kind: "", account_id: "", from: "", to: "", amount_min: undefined, amount_max: undefined })

  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setLoadErr(toFormError(e)))
  }, [])
  useEffect(() => {
    listEntries(q)
      .then((r) => setData({ entries: r.data, total: r.total }))
      .catch((e) => setLoadErr(toFormError(e)))
  }, [q, reload, version])

  const pages = data ? Math.max(1, Math.ceil(data.total / (q.limit ?? 20))) : 1
  const set = (patch: EntryQuery) => setQ((old) => ({ ...old, ...patch, page: patch.page ?? 1 }))
  const accountOptionsSorted = useMemo(() => accounts.slice().sort((a, b) => a.code.localeCompare(b.code)), [accounts])

  return (
    <AppShell title={t("tx.title")} term="journal">
      <div className="grid gap-6">
        <EntryForm accounts={accounts} startDay={user.period_start_day} onPosted={() => setReload((n) => n + 1)} />
        <Status err={loadErr} ok="" />

        <section aria-labelledby="journal-title" className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="journal-title" className="mr-auto text-lg font-semibold"><Term k="journal">{t("tx.journal")}</Term></h2>
            {(["csv", "xlsx"] as const).map((f) => (
              <Button key={f} variant="ghost" size="sm" className="rounded-sm"
                onClick={() => downloadEntries(f, q).catch((e) => setLoadErr(toFormError(e)))}>
                <Download /> {t(f === "csv" ? "fase14.exportCsv" : "fase14.exportXlsx")}
              </Button>
            ))}
            <JournalFilters q={q} set={set} accounts={accountOptionsSorted} />
          </div>

          <MobileList className="md:block lg:hidden" empty={empty}>
            {entries?.map((e) => {
              const side = e.kind === "income" ? e.lines.filter((l) => l.credit > 0) : e.lines.filter((l) => l.debit > 0)
              const parts = side.map((l) => l.contact_name ?? l.name)
              return (
                <MobileItem
                  key={e.id}
                  onClick={() => setOpenId(e.id)}
                  title={e.description || parts.join(", ")}
                  meta={
                    <>
                      <span>{fmtDate(e.entry_date)}</span>
                      <Badge className={cn("rounded-sm", kindBadge[e.kind] ?? "bg-muted text-foreground")}>{t(`kind.${e.kind}`)}</Badge>
                      {e.period_date && <span className="text-primary">{t("tx.nextPeriodMark")}</span>}
                      <span className="w-full truncate">
                        {e.lines.filter((l) => l.credit > 0).map((l) => l.name).join(", ")} → {e.lines.filter((l) => l.debit > 0).map((l) => l.name).join(", ")}
                      </span>
                      {showBalance && e.balance_after !== undefined && <span className="tabular-nums">{t("fase14.balance")} {fmtIDR(e.balance_after)}</span>}
                    </>
                  }
                  value={fmtIDR(amountOf(e))}
                  valueClass={e.kind === "income" ? "text-emerald-700" : e.kind === "expense" ? "text-rose-700" : undefined}
                />
              )
            })}
          </MobileList>

          <TableCard className="hidden lg:block">
            <thead>
              <tr>
                <th>{t("tx.no")}</th>
                <th>{t("common.date")}</th>
                <th>{t("tx.type")}</th>
                <th>{t("common.note")}</th>
                <th>{t("tx.debitCredit")}</th>
                <th className="text-right!">{t("common.amount")}</th>
                {showBalance && <th className="text-right!">{t("fase14.balance")}</th>}
                <th><span className="sr-only">{t("tx.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((e) => {
                const who = (l: Entry["lines"][number]) => (l.contact_name ? `${l.name} (${l.contact_name})` : l.name)
                const dr = e.lines.filter((l) => l.debit > 0).map(who).join(", ")
                const cr = e.lines.filter((l) => l.credit > 0).map(who).join(", ")
                return (
                  <tr key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenId(e.id)}>
                    <td className="text-muted-foreground tabular-nums">{e.entry_no}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(e.entry_date)}
                      {e.period_date && <span className="block text-xs text-primary">{t("tx.nextPeriodMark")}</span>}
                    </td>
                    <td>
                      <Badge className={cn("rounded-sm", kindBadge[e.kind] ?? "bg-muted text-foreground")}>{t(`kind.${e.kind}`)}</Badge>
                    </td>
                    <td className="max-w-56 truncate">{e.description || <span className="text-muted-foreground">—</span>}</td>
                    <td className="whitespace-nowrap">
                      {cr} <span className="text-muted-foreground">→</span> {dr}
                    </td>
                    <td className="text-right font-medium whitespace-nowrap tabular-nums">{fmtIDR(amountOf(e))}</td>
                    {showBalance && <td className="text-right whitespace-nowrap tabular-nums">{e.balance_after !== undefined ? fmtIDR(e.balance_after) : ""}</td>}
                    <td className="text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={t("ed.open", { no: e.entry_no })} onClick={() => setOpenId(e.id)}>
                        <ChevronRight />
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {empty && (
                <tr>
                  <td colSpan={showBalance ? 8 : 7} className="py-10! text-center text-muted-foreground">
                    {empty}
                    {filtered && <Button variant="link" className="ml-1 h-auto p-0" onClick={clearFilters}>{t("common.clearFilters")}</Button>}
                  </td>
                </tr>
              )}
            </tbody>
          </TableCard>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{data ? (total === 1 ? t("tx.countOne") : t("tx.count", { n: total })) : t("common.loading")}</span>
            <span className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" aria-label={t("tx.prevPage")} disabled={(q.page ?? 1) <= 1} onClick={() => set({ page: (q.page ?? 1) - 1 })}>
                <ChevronLeft />
              </Button>
              {t("tx.page", { page: q.page ?? 1, pages })}
              <Button variant="outline" size="icon-sm" aria-label={t("tx.nextPage")} disabled={(q.page ?? 1) >= pages} onClick={() => set({ page: (q.page ?? 1) + 1 })}>
                <ChevronRight />
              </Button>
            </span>
          </div>
        </section>
      </div>
      <EntryDetailSheet id={openId} onClose={() => setOpenId(null)} />
    </AppShell>
  )
}
