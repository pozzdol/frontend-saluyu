import { CheckCircle2, XCircle } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { Badge } from "@/components/ui/badge"
import { getTrialBalance, type TrialBalance } from "@/lib/api"
import { cn, fmtIDR, todayISO } from "@/lib/utils"
import { typeDot } from "@/pages/accounts"
import { DatePicker, fmtDate } from "@/components/picker"
import { Switch } from "@/components/ui/switch"

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
        <DatePicker
          aria-label="Trial balance as of"
          title="As of"
          value={asOf}
          display={`As of ${fmtDate(asOf)}`}
          onChange={(d) => d && setAsOf(d)}
          className="w-full justify-center bg-white font-medium md:h-9 md:w-64"
        />
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
            <label className="ml-auto flex min-h-11 items-center gap-2 text-sm text-muted-foreground md:min-h-0">
              <Switch checked={showEmpty} onCheckedChange={setShowEmpty} />
              Show zero balances
            </label>
          </div>
        )}

        {tb && (
          <MobileList empty={rows.length === 0 ? "No balances yet." : undefined}>
            {rows.map((r) => (
              <MobileItem
                key={r.account_id}
                href={`/app/accounts/${r.account_id}`}
                title={<span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", typeDot[r.type])} />{r.name}</span>}
                meta={<span className="tabular-nums">{r.code} · {r.debit_balance ? "Debit" : r.credit_balance ? "Credit" : "Zero"}</span>}
                value={fmtIDR(r.debit_balance || r.credit_balance)}
              />
            ))}
            <li className="grid grid-cols-2 gap-2 bg-[#eaf2ff]/60 px-4 py-3 text-sm font-semibold tabular-nums">
              <span>Debit {fmtIDR(tb.total_debit)}</span>
              <span className="text-right">Credit {fmtIDR(tb.total_credit)}</span>
            </li>
          </MobileList>
        )}
        {tb && (
          <TableCard className="hidden md:block">
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
