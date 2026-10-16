import { ArrowLeft } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getLedger, type Ledger } from "@/lib/api"
import { cn, fmtIDR } from "@/lib/utils"
import { typeDot } from "@/pages/accounts"
import { kindBadge } from "@/pages/transactions"

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
            <div className="grid gap-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" className="h-9 rounded-sm bg-white" onChange={(e) => setRange((r) => ({ ...r, from: (e.target as HTMLInputElement).value }))} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" className="h-9 rounded-sm bg-white" onChange={(e) => setRange((r) => ({ ...r, to: (e.target as HTMLInputElement).value }))} />
            </div>
          </div>
        )}

        {ledger && (
          <TableCard>
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
                  <td className="whitespace-nowrap">{r.entry_date}</td>
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
