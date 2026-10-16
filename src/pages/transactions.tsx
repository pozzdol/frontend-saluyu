import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Field, SelectField, Status, selectClass, toFormError, useForm, type FormError } from "@/components/field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  ApiError,
  deleteEntry,
  listAccounts,
  listEntries,
  postEntry,
  type Account,
  type AccountType,
  type Entry,
  type EntryQuery,
  type PostEntryInput,
} from "@/lib/api"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"

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
}

const label = (a: Account) => `${a.code} · ${a.name}`

function EntryForm({ accounts, onPosted }: { accounts: Account[]; onPosted: () => void }) {
  const [kind, setKind] = useState<FormKind>("expense")
  const rule = kinds[kind]
  const active = accounts.filter((a) => a.is_active)
  const fromOptions = active.filter((a) => a.type === rule.from)
  const toOptions = active.filter((a) => a.type === rule.to)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  // Reset the selection when the kind changes, defaulting to the first sensible account.
  useEffect(() => {
    setFrom(fromOptions[0]?.id ?? "")
    setTo(toOptions.find((a) => a.id !== fromOptions[0]?.id)?.id ?? "")
  }, [kind, accounts])

  const form = useForm(async (v, el) => {
    const amount = toSen(v.amount)
    if (!(amount > 0)) throw new ApiError(400, "validation failed", { amount: "must be a positive amount" })
    await postEntry({ kind, entry_date: v.entry_date, amount, from_account_id: from, to_account_id: to, description: v.description })
    // Keep date and accounts for the next entry: people usually log several in a row.
    ;(el.elements.namedItem("amount") as HTMLInputElement).value = ""
    ;(el.elements.namedItem("description") as HTMLInputElement).value = ""
    onPosted()
    return `${rule.label} saved.`
  })
  const err = form.err

  return (
    <Card className="rounded-sm">
      <CardContent>
        <div role="tablist" aria-label="Transaction type" className="mb-5 inline-flex rounded-sm border bg-[#f7f8fa] p-1">
          {(Object.keys(kinds) as FormKind[]).map((k) => {
            const Icon = kinds[k].icon
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm px-4 py-1.5 text-sm text-muted-foreground",
                  kind === k && "bg-white font-medium text-primary shadow-sm",
                )}
              >
                <Icon className="size-4" />
                {kinds[k].label}
              </button>
            )
          })}
        </div>

        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-6">
            <Status err={err} ok={form.ok} />
          </div>
          <Field name="entry_date" label="Date" type="date" defaultValue={todayISO()} error={err.fields?.entry_date} />
          <div className="md:col-span-2">
            <Field name="amount" label="Amount (Rp)" placeholder="25.000" error={err.fields?.amount} />
          </div>
          <SelectField name="from" label={rule.fromLabel} value={from} onChange={setFrom} error={err.fields?.from_account_id} className="md:col-span-3">
            {fromOptions.map((a) => (
              <option key={a.id} value={a.id}>{label(a)}</option>
            ))}
          </SelectField>
          <SelectField name="to" label={rule.toLabel} value={to} onChange={setTo} error={err.fields?.to_account_id} className="md:col-span-3">
            {toOptions.map((a) => (
              <option key={a.id} value={a.id}>{label(a)}</option>
            ))}
          </SelectField>
          <div className="md:col-span-3">
            <Field name="description" label="Note" placeholder={kind === "income" ? "Gaji September" : "Makan siang"} error={err.fields?.description} />
          </div>
          <div className="flex items-end md:col-span-6">
            <Button type="submit" disabled={form.busy} className="h-10 rounded-sm px-8">
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

export function Transactions() {
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
  const accountOptions = useMemo(() => accounts.slice().sort((a, b) => a.code.localeCompare(b.code)), [accounts])

  return (
    <AppShell title="Transactions">
      <div className="grid gap-6">
        <EntryForm accounts={accounts} onPosted={() => setReload((n) => n + 1)} />
        <Status err={loadErr} ok="" />

        <section aria-labelledby="journal-title" className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <h2 id="journal-title" className="mr-auto text-lg font-semibold">Journal</h2>
            <Input
              type="search"
              placeholder="Search note"
              aria-label="Search note"
              className="h-9 w-44 rounded-sm bg-white"
              onChange={(e) => set({ q: (e.target as HTMLInputElement).value })}
            />
            <select aria-label="Type" className={cn(selectClass, "h-9 w-36 bg-white")} onChange={(e) => set({ kind: (e.target as HTMLSelectElement).value })}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
            <select aria-label="Account" className={cn(selectClass, "h-9 w-48 bg-white")} onChange={(e) => set({ account_id: (e.target as HTMLSelectElement).value })}>
              <option value="">All accounts</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>{label(a)}</option>
              ))}
            </select>
            <Input type="date" aria-label="From date" className="h-9 w-40 rounded-sm bg-white" onChange={(e) => set({ from: (e.target as HTMLInputElement).value })} />
            <Input type="date" aria-label="To date" className="h-9 w-40 rounded-sm bg-white" onChange={(e) => set({ to: (e.target as HTMLInputElement).value })} />
          </div>

          <TableCard>
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
                const dr = e.lines.filter((l) => l.debit > 0).map((l) => l.name).join(", ")
                const cr = e.lines.filter((l) => l.credit > 0).map((l) => l.name).join(", ")
                return (
                  <tr key={e.id}>
                    <td className="text-muted-foreground tabular-nums">{e.entry_no}</td>
                    <td className="whitespace-nowrap tabular-nums">{e.entry_date}</td>
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
