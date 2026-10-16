import { CheckCircle2, XCircle } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getTrialBalance, type TrialBalance } from "@/lib/api"
import { cn, fmtIDR, todayISO } from "@/lib/utils"
import { typeDot } from "@/pages/accounts"

// TrialBalancePage replaces the Excel "Neraca" sheet, whose SUM range skipped rows.
// Every account is listed, so total debit must always equal total credit.
export function TrialBalancePage() {
  const [asOf, setAsOf] = useState(todayISO())
  const [tb, setTb] = useState<TrialBalance | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [showEmpty, setShowEmpty] = useState(false)

  useEffect(() => {
    if (!asOf) return
    getTrialBalance(asOf).then(setTb).catch((e) => setErr(toFormError(e)))
  }, [asOf])

  const rows = tb?.rows.filter((r) => showEmpty || r.debit_balance !== 0 || r.credit_balance !== 0) ?? []
  const money = (n: number) => (n === 0 ? <span className="text-muted-foreground">—</span> : fmtIDR(n))

  return (
    <AppShell
      title="Trial balance"
      actions={
        <div className="grid gap-1">
          <Label htmlFor="as_of">As of</Label>
          <Input id="as_of" type="date" value={asOf} className="h-9 rounded-sm bg-white" onChange={(e) => setAsOf((e.target as HTMLInputElement).value)} />
        </div>
      }
    >
      <div className="grid gap-4">
        <Status err={err} ok="" />
        {tb && (
          <div className="flex flex-wrap items-center gap-3">
            {tb.balanced ? (
              <Badge className="rounded-sm bg-emerald-50 px-2.5 py-1 text-emerald-700">
                <CheckCircle2 /> Balanced
              </Badge>
            ) : (
              <Badge className="rounded-sm bg-rose-50 px-2.5 py-1 text-rose-700">
                <XCircle /> Not balanced: off by {fmtIDR(Math.abs(tb.total_debit - tb.total_credit))}
              </Badge>
            )}
            <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty((e.target as HTMLInputElement).checked)} className="accent-primary" />
              Show accounts with zero balance
            </label>
          </div>
        )}

        {tb && (
          <TableCard>
            <thead>
              <tr>
                <th className="w-24">Code</th>
                <th>Account</th>
                <th className="text-right!">Debit</th>
                <th className="text-right!">Credit</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.account_id}>
                  <td>{r.code}</td>
                  <td>
                    <a href={`/app/accounts/${r.account_id}`} className="flex items-center gap-2 hover:text-primary hover:underline">
                      <span className={cn("size-2 rounded-full", typeDot[r.type])} />
                      {r.name}
                    </a>
                  </td>
                  <td className="text-right whitespace-nowrap">{money(r.debit_balance)}</td>
                  <td className="text-right whitespace-nowrap">{money(r.credit_balance)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8! text-center text-muted-foreground">No balances yet.</td>
                </tr>
              )}
              <tr className="bg-[#eaf2ff]/60 font-semibold">
                <td colSpan={2}>Total</td>
                <td className="text-right whitespace-nowrap">{fmtIDR(tb.total_debit)}</td>
                <td className="text-right whitespace-nowrap">{fmtIDR(tb.total_credit)}</td>
              </tr>
            </tbody>
          </TableCard>
        )}
      </div>
    </AppShell>
  )
}
