import { ArrowLeft } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { getLedger, type Ledger } from "@/lib/api"
import { cn, fmtIDR } from "@/lib/utils"
import { typeDot } from "@/pages/accounts"
import { kindBadge } from "@/pages/transactions"
import { DatePicker, fmtDate } from "@/components/picker"

// LedgerPage is one account's history with a running balance (the Excel "Buku Besar" sheet).
export function LedgerPage({ id }: { id: string }) {
  const [range, setRange] = useState({ from: "", to: "" })
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    setErr({})
    getLedger(id, range).then(setLedger).catch((e) => setErr(toFormError(e)))
  }, [id, range])

  const a = ledger?.account
  const money = (n: number) => (n === 0 ? <span className="text-muted-foreground">—</span> : fmtIDR(n))

  return (
    <AppShell
      title={a ? `${a.code} · ${a.name}` : "Ledger"}
      actions={
        <a href="/app/accounts" className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> All accounts
        </a>
      }
    >
      <div className="grid gap-4">
        <Status err={err} ok="" />
        {a && (
          <div className="flex flex-wrap items-end gap-4">
            <p className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
              <span className={cn("size-2.5 rounded-full", typeDot[a.type])} />
              {a.type} · {a.category} · normal balance {a.normal_balance.toLowerCase()}
              {!a.is_active && <Badge className="rounded-sm bg-muted text-muted-foreground">Inactive</Badge>}
            </p>
            <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
              <div className="grid gap-1">
                <Label htmlFor="from">From</Label>
                <DatePicker id="from" title="From" placeholder="Start" clearable value={range.from} onChange={(d) => setRange((r) => ({ ...r, from: d }))} className="bg-white md:h-9 md:w-44" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="to">To</Label>
                <DatePicker id="to" title="To" placeholder="Today" clearable value={range.to} onChange={(d) => setRange((r) => ({ ...r, to: d }))} className="bg-white md:h-9 md:w-44" />
              </div>
            </div>
          </div>
        )}

        {ledger && (
          <MobileList empty={ledger.rows.length === 0 ? "No movements in this range." : undefined}>
            <MobileItem title="Opening balance" meta={range.from ? `Before ${fmtDate(range.from)}` : undefined} value={fmtIDR(ledger.opening)} />
            {ledger.rows.map((r, i) => (
              <MobileItem
                key={`${r.entry_id}-${i}`}
                title={r.description || r.counter}
                meta={<><span>{fmtDate(r.entry_date)}</span><span>{r.counter}</span><span>Balance {fmtIDR(r.balance)}</span></>}
                value={r.debit ? `+ ${fmtIDR(r.debit)}` : `− ${fmtIDR(r.credit)}`}
                valueClass={(r.debit > 0) === (ledger.account.normal_balance === "Debit") ? "text-emerald-700" : "text-rose-700"}
              />
            ))}
            <MobileItem title="Closing balance" value={fmtIDR(ledger.closing)} valueClass={ledger.closing < 0 ? "text-destructive" : undefined} />
          </MobileList>
        )}
        {ledger && (
          <TableCard className="hidden md:block">
            <thead>
              <tr>
                <th>Date</th>
                <th>No</th>
                <th>Type</th>
                <th>Note</th>
                <th>Counter account</th>
                <th className="text-right!">Debit</th>
                <th className="text-right!">Credit</th>
                <th className="text-right!">Balance</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="bg-[#f7f8fa]/60">
                <td colSpan={7} className="font-medium">Opening balance{range.from && ` (before ${range.from})`}</td>
                <td className="text-right font-medium">{fmtIDR(ledger.opening)}</td>
              </tr>
              {ledger.rows.map((r, i) => (
                <tr key={`${r.entry_id}-${i}`}>
                  <td className="whitespace-nowrap">{fmtDate(r.entry_date)}</td>
                  <td className="text-muted-foreground">{r.entry_no}</td>
                  <td>
                    <Badge className={cn("rounded-sm capitalize", kindBadge[r.kind] ?? "bg-muted text-foreground")}>{r.kind.replace("_", " ")}</Badge>
                  </td>
                  <td className="max-w-56 truncate">{r.description || <span className="text-muted-foreground">—</span>}</td>
                  <td>{r.counter}</td>
                  <td className="text-right whitespace-nowrap">{money(r.debit)}</td>
                  <td className="text-right whitespace-nowrap">{money(r.credit)}</td>
                  <td className={cn("text-right whitespace-nowrap", r.balance < 0 && "text-destructive")}>{fmtIDR(r.balance)}</td>
                </tr>
              ))}
              {ledger.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8! text-center text-muted-foreground">No movements in this range.</td>
                </tr>
              )}
              <tr className="bg-[#eaf2ff]/60">
                <td colSpan={7} className="font-semibold">Closing balance</td>
                <td className={cn("text-right font-semibold", ledger.closing < 0 && "text-destructive")}>{fmtIDR(ledger.closing)}</td>
              </tr>
            </tbody>
          </TableCard>
        )}
      </div>
    </AppShell>
  )
}
