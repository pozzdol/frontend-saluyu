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
import { Info, Term } from "@/components/term"
import { useT } from "@/lib/i18n"

// LedgerPage is one account's history with a running balance (the Excel "Buku Besar" sheet).
export function LedgerPage({ id }: { id: string }) {
  const t = useT()
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
      title={a ? `${a.code} · ${a.name}` : t("ledger.title")}
      term="ledger"
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
              {t(`type.${a.type}`)} · {a.category} · {t("acct.growsOn", { side: a.normal_balance === "Debit" ? "debit" : t("glossary.credit.label").toLowerCase() })}
              <Info k="normalBalance" />
              {!a.is_active && <Badge className="rounded-sm bg-muted text-muted-foreground">{t("common.inactive")}</Badge>}
            </p>
            <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
              <div className="grid gap-1">
                <Label htmlFor="from">{t("ledger.from")}</Label>
                <DatePicker id="from" title={t("ledger.from")} placeholder={t("ledger.start")} clearable value={range.from} onChange={(d) => setRange((r) => ({ ...r, from: d }))} className="bg-white md:h-9 md:w-44" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="to">{t("ledger.to")}</Label>
                <DatePicker id="to" title={t("ledger.to")} placeholder={t("ledger.today")} clearable value={range.to} onChange={(d) => setRange((r) => ({ ...r, to: d }))} className="bg-white md:h-9 md:w-44" />
              </div>
            </div>
          </div>
        )}

        {ledger && (
          <MobileList empty={ledger.rows.length === 0 ? t("ledger.empty") : undefined}>
            <MobileItem title={t("ledger.opening")} meta={range.from ? t("ledger.before", { date: fmtDate(range.from) }) : undefined} value={fmtIDR(ledger.opening)} />
            {ledger.rows.map((r, i) => (
              <MobileItem
                key={`${r.entry_id}-${i}`}
                title={r.description || r.counter}
                meta={<><span>{fmtDate(r.entry_date)}</span><span>{r.counter}</span><span>Balance {fmtIDR(r.balance)}</span></>}
                value={r.debit ? `+ ${fmtIDR(r.debit)}` : `− ${fmtIDR(r.credit)}`}
                valueClass={(r.debit > 0) === (ledger.account.normal_balance === "Debit") ? "text-emerald-700" : "text-rose-700"}
              />
            ))}
            <MobileItem title={t("ledger.closing")} value={fmtIDR(ledger.closing)} valueClass={ledger.closing < 0 ? "text-destructive" : undefined} />
          </MobileList>
        )}
        {ledger && (
          <TableCard className="hidden md:block">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th>{t("tx.no")}</th>
                <th>{t("tx.type")}</th>
                <th>{t("common.note")}</th>
                <th>{t("ledger.counter")}</th>
                <th className="text-right!"><Term k="debit" /></th>
                <th className="text-right!"><Term k="credit" /></th>
                <th className="text-right!">{t("ledger.balance")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="bg-[#f7f8fa]/60">
                <td colSpan={7} className="font-medium">{range.from ? t("ledger.openingBefore", { date: fmtDate(range.from) }) : t("ledger.opening")}</td>
                <td className="text-right font-medium">{fmtIDR(ledger.opening)}</td>
              </tr>
              {ledger.rows.map((r, i) => (
                <tr key={`${r.entry_id}-${i}`}>
                  <td className="whitespace-nowrap">{fmtDate(r.entry_date)}</td>
                  <td className="text-muted-foreground">{r.entry_no}</td>
                  <td>
                    <Badge className={cn("rounded-sm capitalize", kindBadge[r.kind] ?? "bg-muted text-foreground")}>{t(`kind.${r.kind}`)}</Badge>
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
                  <td colSpan={8} className="py-8! text-center text-muted-foreground">{t("ledger.empty")}</td>
                </tr>
              )}
              <tr className="bg-[#eaf2ff]/60">
                <td colSpan={7} className="font-semibold">{t("ledger.closing")}</td>
                <td className={cn("text-right font-semibold", ledger.closing < 0 && "text-destructive")}>{fmtIDR(ledger.closing)}</td>
              </tr>
            </tbody>
          </TableCard>
        )}
      </div>
    </AppShell>
  )
}
