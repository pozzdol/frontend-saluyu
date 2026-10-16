import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Loader2, SlidersHorizontal, Trash2 } from "lucide-react"
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
  perContact,
  deleteEntry,
  listAccounts,
  listEntries,
  postEntry,
  type Account,
  type AccountType,
  type Entry,
  type EntryQuery,
  type PostEntryInput,
  type User,
} from "@/lib/api"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"

// daysBetween counts whole days from date a to date b (YYYY-MM-DD), DST-safe via UTC.
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)

type FormKind = PostEntryInput["kind"]

// Which account types each form moves money between. Mirrors kindRules in the Go service.
const kinds: Record<FormKind, { label: string; icon: typeof ArrowUpRight; from: AccountType; to: AccountType; fromLabel: string; toLabel: string }> = {
  expense: { label: "Expense", icon: ArrowUpRight, from: "Asset", to: "Expense", fromLabel: "Paid from", toLabel: "Category" },
  income: { label: "Income", icon: ArrowDownLeft, from: "Revenue", to: "Asset", fromLabel: "Source", toLabel: "Received into" },
  transfer: { label: "Transfer", icon: ArrowLeftRight, from: "Asset", to: "Asset", fromLabel: "From", toLabel: "To" },
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
}

function EntryForm({ accounts, startDay, onPosted }: { accounts: Account[]; startDay: number; onPosted: () => void }) {
  const [kind, setKind] = useState<FormKind>("expense")
  const rule = kinds[kind]
  // 1101/2101 need a person: those go through the Contacts page instead.
  const active = accounts.filter((a) => a.is_active && !perContact(a.code))
  const fromOptions = active.filter((a) => a.type === rule.from)
  const toOptions = active.filter((a) => a.type === rule.to)
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

  // Reset the selection when the kind changes, defaulting to the first sensible account.
  useEffect(() => {
    setFrom(fromOptions[0]?.id ?? "")
    setTo(toOptions.find((a) => a.id !== fromOptions[0]?.id)?.id ?? "")
  }, [kind, accounts])

  const form = useForm(async (v, el) => {
    const amount = toSen(v.amount)
    if (!(amount > 0)) throw new ApiError(400, "validation failed", { amount: "must be a positive amount" })
    await postEntry({ kind, entry_date: date, amount, from_account_id: from, to_account_id: to, description: v.description, ...(showNext && nextPeriod && { next_period: true }) })
    // Keep date and accounts for the next entry: people usually log several in a row.
    ;(el.elements.namedItem("amount") as HTMLInputElement).value = ""
    ;(el.elements.namedItem("description") as HTMLInputElement).value = ""
    setNextPeriod(false)
    onPosted()
    return `${rule.label} saved.`
  })
  const err = form.err

  return (
    <Card className="rounded-sm">
      <CardContent>
        <Segmented
          label="Transaction type"
          className="mb-5"
          value={kind}
          onChange={setKind}
          items={(Object.keys(kinds) as FormKind[]).map((k) => {
            const Icon = kinds[k].icon
            return { value: k, label: <><Icon className="size-4" />{kinds[k].label}</> }
          })}
        />

        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-6">
            <Status err={err} ok={form.ok} />
          </div>
          <div className="md:col-span-2">
            <AmountField name="amount" label="Amount (Rp)" placeholder="25.000" error={err.fields?.amount} />
          </div>
          <DateField name="entry_date" label="Date" value={date} onChange={setDate} error={err.fields?.entry_date} className="md:col-span-1" />
          <SelectField name="from" label={rule.fromLabel} value={from} onChange={setFrom} options={accountOptions(fromOptions)} error={err.fields?.from_account_id} className="md:col-span-3" />
          <SelectField name="to" label={rule.toLabel} value={to} onChange={setTo} options={accountOptions(toOptions)} error={err.fields?.to_account_id} className="md:col-span-3" />
          <div className="md:col-span-3">
            <Field name="description" label="Note" placeholder={kind === "income" ? "Gaji September" : "Makan siang"} error={err.fields?.description} />
          </div>
          {showNext && (
            <div className="md:col-span-6">
              <CheckboxField
                name="next_period"
                label="Count toward next period"
                hint={`Salary that arrives early: it will show in the period starting ${fmtDate(nextStart)}.`}
                checked={nextPeriod}
                onChange={setNextPeriod}
              />
            </div>
          )}
          <div className="flex items-end md:col-span-6">
            <Button type="submit" disabled={form.busy} className="h-10 w-full rounded-sm px-8 md:w-auto">
              {form.busy && <Loader2 className="animate-spin" />}
              Save {rule.label.toLowerCase()}
            </Button>
          </div>
        </form>
        {kind === "income" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Got a refund? Record it as income from <span className="font-medium">4003 · Pengembalian</span>, so expense
            totals never go negative.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// amountOf is the size of an entry: its total debits (equal to its total credits).
const amountOf = (e: Entry) => e.lines.reduce((s, l) => s + l.debit, 0)

function DeleteButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!armed)
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Delete entry" onClick={() => setArmed(true)}>
        <Trash2 />
      </Button>
    )
  return (
    <span className="flex items-center gap-1">
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await onConfirm().finally(() => setBusy(false))
        }}
      >
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  )
}

const kindOptions = [
  { value: "", label: "All types" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
  { value: "loan", label: "Loan" },
  { value: "repayment", label: "Repayment" },
  { value: "opening", label: "Opening" },
  { value: "cash_count", label: "Cash count" },
  { value: "adjustment", label: "Adjustment" },
]

// JournalFilters sit inline on desktop; on phones they live behind a "Filters" button in a
// bottom sheet so the list stays on screen.
function JournalFilters({ q, set, accounts }: { q: EntryQuery; set: (p: EntryQuery) => void; accounts: Account[] }) {
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const active = [q.q, q.kind, q.account_id, q.from, q.to].filter(Boolean).length
  const accountOpts = [{ value: "", label: "All accounts" }, ...accountOptions(accounts)]

  const controls = (
    <>
      <Input
        type="search"
        placeholder="Search note"
        aria-label="Search note"
        defaultValue={q.q ?? ""}
        className="h-11 rounded-sm bg-white md:h-9 md:w-44"
        onChange={(e) => set({ q: (e.target as HTMLInputElement).value })}
      />
      <SelectPicker aria-label="Type" title="Type" value={q.kind ?? ""} options={kindOptions} onChange={(v) => set({ kind: v })} className="bg-white md:h-9 md:w-40" />
      <SelectPicker aria-label="Account" title="Account" value={q.account_id ?? ""} options={accountOpts} onChange={(v) => set({ account_id: v })} className="bg-white md:h-9 md:w-52" />
      <DatePicker aria-label="From date" title="From" placeholder="From" clearable value={q.from ?? ""} onChange={(v) => set({ from: v })} className="bg-white md:h-9 md:w-40" />
      <DatePicker aria-label="To date" title="To" placeholder="To" clearable value={q.to ?? ""} onChange={(v) => set({ to: v })} className="bg-white md:h-9 md:w-40" />
    </>
  )

  if (!mobile) return <div className="flex flex-wrap items-center gap-2">{controls}</div>
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="rounded-sm bg-white">
          <SlidersHorizontal /> Filters{active > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{active}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" title="Filter journal">
        <div className="grid gap-3 pb-2">
          {controls}
          <Button className="rounded-sm" onClick={() => setOpen(false)}>Show results</Button>
          {active > 0 && (
            <Button variant="ghost" onClick={() => (set({ q: "", kind: "", account_id: "", from: "", to: "" }), setOpen(false))}>Clear filters</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function Transactions({ user }: { user: User }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [q, setQ] = useState<EntryQuery>({ page: 1, limit: 20 })
  const [data, setData] = useState<{ entries: Entry[]; total: number } | null>(null)
  const [loadErr, setLoadErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)

  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setLoadErr(toFormError(e)))
  }, [])
  useEffect(() => {
    listEntries(q)
      .then((r) => setData({ entries: r.data, total: r.total }))
      .catch((e) => setLoadErr(toFormError(e)))
  }, [q, reload])

  const pages = data ? Math.max(1, Math.ceil(data.total / (q.limit ?? 20))) : 1
  const set = (patch: EntryQuery) => setQ((old) => ({ ...old, ...patch, page: patch.page ?? 1 }))
  const accountOptionsSorted = useMemo(() => accounts.slice().sort((a, b) => a.code.localeCompare(b.code)), [accounts])

  return (
    <AppShell title="Transactions">
      <div className="grid gap-6">
        <EntryForm accounts={accounts} startDay={user.period_start_day} onPosted={() => setReload((n) => n + 1)} />
        <Status err={loadErr} ok="" />

        <section aria-labelledby="journal-title" className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="journal-title" className="mr-auto text-lg font-semibold">Journal</h2>
            <JournalFilters q={q} set={set} accounts={accountOptionsSorted} />
          </div>

          <MobileList empty={data && data.entries.length === 0 ? "No transactions yet. Record your first one above." : undefined}>
            {data?.entries.map((e) => {
              const side = e.kind === "income" ? e.lines.filter((l) => l.credit > 0) : e.lines.filter((l) => l.debit > 0)
              const parts = side.map((l) => l.contact_name ?? l.name)
              return (
                <MobileItem
                  key={e.id}
                  title={e.description || parts.join(", ")}
                  meta={
                    <>
                      <span>{fmtDate(e.entry_date)}</span>
                      <Badge className={cn("rounded-sm capitalize", kindBadge[e.kind] ?? "bg-muted text-foreground")}>{e.kind.replace("_", " ")}</Badge>
                      {e.period_date && <span className="text-primary">→ next period</span>}
                      <span className="w-full truncate">
                        {e.lines.filter((l) => l.debit > 0).map((l) => l.name).join(", ")} ← {e.lines.filter((l) => l.credit > 0).map((l) => l.name).join(", ")}
                      </span>
                    </>
                  }
                  value={fmtIDR(amountOf(e))}
                  valueClass={e.kind === "income" ? "text-emerald-700" : e.kind === "expense" ? "text-rose-700" : undefined}
                  actions={
                    <DeleteButton
                      onConfirm={() =>
                        deleteEntry(e.id)
                          .then(() => setReload((n) => n + 1))
                          .catch((err) => setLoadErr(toFormError(err)))
                      }
                    />
                  }
                />
              )
            })}
          </MobileList>

          <TableCard className="hidden md:block">
            <thead>
              <tr>
                <th>No</th>
                <th>Date</th>
                <th>Type</th>
                <th>Note</th>
                <th>Debit → Credit</th>
                <th className="text-right!">Amount</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.map((e) => {
                const who = (l: Entry["lines"][number]) => (l.contact_name ? `${l.name} (${l.contact_name})` : l.name)
                const dr = e.lines.filter((l) => l.debit > 0).map(who).join(", ")
                const cr = e.lines.filter((l) => l.credit > 0).map(who).join(", ")
                return (
                  <tr key={e.id}>
                    <td className="text-muted-foreground tabular-nums">{e.entry_no}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(e.entry_date)}
                      {e.period_date && <span className="block text-xs text-primary">→ next period</span>}
                    </td>
                    <td>
                      <Badge className={cn("rounded-sm capitalize", kindBadge[e.kind] ?? "bg-muted text-foreground")}>{e.kind.replace("_", " ")}</Badge>
                    </td>
                    <td className="max-w-56 truncate">{e.description || <span className="text-muted-foreground">—</span>}</td>
                    <td className="whitespace-nowrap">
                      {dr} <span className="text-muted-foreground">→</span> {cr}
                    </td>
                    <td className="text-right font-medium whitespace-nowrap tabular-nums">{fmtIDR(amountOf(e))}</td>
                    <td className="text-right">
                      <DeleteButton
                        onConfirm={() =>
                          deleteEntry(e.id)
                            .then(() => setReload((n) => n + 1))
                            .catch((err) => setLoadErr(toFormError(err)))
                        }
                      />
                    </td>
                  </tr>
                )
              })}
              {data && data.entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10! text-center text-muted-foreground">
                    No transactions yet. Record your first one above.
                  </td>
                </tr>
              )}
            </tbody>
          </TableCard>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{data ? `${data.total} transaction${data.total === 1 ? "" : "s"}` : "Loading…"}</span>
            <span className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={(q.page ?? 1) <= 1} onClick={() => set({ page: (q.page ?? 1) - 1 })}>
                <ChevronLeft />
              </Button>
              Page {q.page} of {pages}
              <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={(q.page ?? 1) >= pages} onClick={() => set({ page: (q.page ?? 1) + 1 })}>
                <ChevronRight />
              </Button>
            </span>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
