import { Info, Loader2, Lock } from "lucide-react"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Field, Status, toFormError, type FormError } from "@/components/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ApiError, getOpening, listAccounts, setOpening, type Account, type Opening, type User } from "@/lib/api"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"
import { typeDot } from "@/pages/accounts"

// Receivables (1101) and payables (2101) are tracked per contact, which arrives in phase 4.
const perContact = new Set(["1101", "2101"])

// OpeningPage replaces the missing "saldo awal" in the Excel: the real balance of every
// asset and liability on the day the books open. The rest is net worth (3001).
export function OpeningPage({ user }: { user: User }) {
  const { route } = useLocation()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [opening, setOpeningState] = useState<Opening | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([listAccounts(), getOpening()])
      .then(([list, o]) => {
        setAccounts(list.filter((a) => (a.type === "Asset" || a.type === "Liability") && !perContact.has(a.code) && a.is_active))
        setOpeningState(o)
        // Prefill from an existing opening entry, in rupiah with a decimal comma.
        const prefill: Record<string, string> = {}
        for (const l of o.entry?.lines ?? []) prefill[l.account_id] = String((l.debit || l.credit) / 100).replace(".", ",")
        setAmounts(prefill)
      })
      .catch((e) => setErr(toFormError(e)))
  }, [])

  const sen = (id: string) => (amounts[id] ? toSen(amounts[id]) : 0)
  const total = (type: Account["type"]) => accounts.filter((a) => a.type === type).reduce((s, a) => s + (sen(a.id) || 0), 0)
  const assets = total("Asset")
  const liabilities = total("Liability")
  const invalid = accounts.filter((a) => amounts[a.id] && !(sen(a.id) >= 0))
  const firstTime = !user.start_date

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    const date = (new FormData(e.currentTarget as HTMLFormElement).get("start_date") as string) || ""
    if (invalid.length > 0) {
      setErr({ message: `Check the amount for ${invalid.map((a) => a.name).join(", ")}.` })
      return
    }
    setBusy(true)
    setErr({})
    try {
      await setOpening({ start_date: date, items: accounts.map((a) => ({ account_id: a.id, amount: sen(a.id) })) })
      route("/app/transactions")
    } catch (e) {
      setErr(e instanceof ApiError ? toFormError(e) : { message: "Cannot reach the server." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell title="Opening balance">
      <div className="grid gap-6">
        {firstTime && (
          <Alert className="rounded-sm border-[#cfe0ff] bg-[#f4f8ff]">
            <Info className="text-primary" />
            <AlertDescription className="text-foreground">
              Welcome! Before recording transactions, enter what you really have today: open your bank and e-wallet
              apps and count the cash in your wallet. Leave an account empty if it is zero.
            </AlertDescription>
          </Alert>
        )}

        {opening && !opening.editable ? (
          <Alert className="rounded-sm">
            <Lock />
            <AlertDescription>
              Your books opened on <span className="font-medium">{opening.start_date}</span> and already have transactions, so
              the opening balance is locked. Use <a href="/app/reconcile" className="text-primary hover:underline">Reconcile</a>{" "}
              to correct a balance from a later date.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-6">
            <Status err={err} ok="" />
            <Card className="rounded-sm">
              <CardContent className="grid gap-4 sm:grid-cols-[14rem_1fr] sm:items-end">
                <Field
                  name="start_date"
                  label="Books open on"
                  type="date"
                  defaultValue={opening?.start_date ?? todayISO()}
                  error={err.fields?.start_date}
                />
                <p className="text-sm text-muted-foreground">
                  Transactions before this date cannot be recorded. Pick the day these balances are true, for example
                  the day your salary arrives.
                </p>
              </CardContent>
            </Card>

            {(["Asset", "Liability"] as const).map((type) => {
              const rows = accounts.filter((a) => a.type === type)
              if (rows.length === 0) return null
              return (
                <section key={type} className="grid gap-2">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <span className={cn("size-2.5 rounded-full", typeDot[type])} />
                    {type === "Asset" ? "What you have" : "What you owe"}
                  </h2>
                  <TableCard>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.id}>
                          <td className="w-20 text-muted-foreground tabular-nums">{a.code}</td>
                          <td>
                            <label htmlFor={`amt-${a.id}`}>{a.name}</label>
                          </td>
                          <td className="w-56">
                            <Input
                              id={`amt-${a.id}`}
                              inputMode="decimal"
                              placeholder="0"
                              value={amounts[a.id] ?? ""}
                              aria-invalid={invalid.includes(a)}
                              onInput={(e) => setAmounts((m) => ({ ...m, [a.id]: (e.target as HTMLInputElement).value }))}
                              className="h-9 rounded-sm text-right tabular-nums"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableCard>
                </section>
              )
            })}

            <Card className="rounded-sm">
              <CardContent className="grid gap-2 text-sm tabular-nums sm:max-w-md">
                <p className="flex justify-between"><span>Total assets</span><span>{fmtIDR(assets)}</span></p>
                <p className="flex justify-between"><span>Total liabilities</span><span>− {fmtIDR(liabilities)}</span></p>
                <p className="flex justify-between border-t pt-2 font-semibold">
                  <span>Net worth (3001 Ekuitas Saldo Awal)</span>
                  <span className={cn(assets - liabilities < 0 && "text-destructive")}>{fmtIDR(assets - liabilities)}</span>
                </p>
              </CardContent>
            </Card>

            <div>
              <Button type="submit" disabled={busy} className="h-10 rounded-sm px-8">
                {busy && <Loader2 className="animate-spin" />}
                {firstTime ? "Open my books" : "Save opening balance"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  )
}
