import { Loader2, ScanSearch, Wallet } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell } from "@/components/app-shell"
import { Field, SelectField, Status, toFormError, type FormError } from "@/components/field"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ApiError, cashCount, getBalance, listAccounts, reconcile, type Account } from "@/lib/api"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"

type Mode = "cash" | "bank"

const perContact = new Set(["1101", "2101"])
const label = (a: Account) => `${a.code} · ${a.name}`

// ReconcilePage fixes the Excel problem of cash that never went down: count what you really
// have, and the gap becomes an entry (unrecorded spending, found money, or a bank fee).
export function ReconcilePage() {
  const [mode, setMode] = useState<Mode>("cash")
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState("")
  const [counterId, setCounterId] = useState("")
  const [date, setDate] = useState(todayISO())
  const [actual, setActual] = useState("")
  const [book, setBook] = useState<number | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [ok, setOk] = useState("")
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setErr(toFormError(e)))
  }, [])

  const targets = accounts.filter((a) =>
    a.is_active && !perContact.has(a.code) && (mode === "cash" ? a.type === "Asset" : a.type === "Asset" || a.type === "Liability"),
  )
  const counters = accounts.filter((a) => a.is_active && (a.type === "Revenue" || a.type === "Expense"))
  const actualSen = actual ? toSen(actual) : NaN
  const diff = book !== null && actualSen >= 0 ? actualSen - book : null

  // Default account per mode: Cash for a cash count, Bank for a statement.
  useEffect(() => {
    const preferred = accounts.find((a) => a.code === (mode === "cash" ? "1002" : "1001"))
    setAccountId(preferred?.id ?? targets[0]?.id ?? "")
    setOk("")
    setErr({})
  }, [mode, accounts])

  // Bank statement default counter: admin fee when money is missing, interest when there is more.
  useEffect(() => {
    if (mode !== "bank" || diff === null || diff === 0) return
    const code = diff < 0 ? "5107" : "4002"
    setCounterId((cur) => cur || accounts.find((a) => a.code === code)?.id || "")
  }, [mode, diff === null ? 0 : Math.sign(diff), accounts])

  useEffect(() => {
    if (!accountId || !date) return
    setBook(null)
    getBalance(accountId, date).then(setBook).catch((e) => setErr(toFormError(e)))
  }, [accountId, date, reload])

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!(actualSen >= 0)) {
      setErr({ fields: { actual: "enter the amount you counted" } })
      return
    }
    setBusy(true)
    setErr({})
    setOk("")
    try {
      const body = { account_id: accountId, date, actual: actualSen }
      const res = mode === "cash" ? await cashCount(body) : await reconcile({ ...body, counter_account_id: counterId })
      if (res.diff === 0) setOk("Books already match. Nothing was posted.")
      else {
        const entry = res.entry!
        const other = entry.lines.find((l) => l.account_id !== accountId)!
        setOk(`Posted ${fmtIDR(Math.abs(res.diff))} to ${other.code} · ${other.name} (entry #${entry.entry_no}).`)
      }
      setActual("")
      setReload((n) => n + 1)
    } catch (e) {
      setErr(e instanceof ApiError ? toFormError(e) : { message: "Cannot reach the server." })
    } finally {
      setBusy(false)
    }
  }

  const tabs: { mode: Mode; label: string; icon: typeof Wallet }[] = [
    { mode: "cash", label: "Cash count", icon: Wallet },
    { mode: "bank", label: "Bank statement", icon: ScanSearch },
  ]

  return (
    <AppShell title="Reconcile">
      <div className="grid max-w-3xl gap-6">
        <div role="tablist" aria-label="Reconcile type" className="inline-flex w-fit rounded-sm border bg-white p-1">
          {tabs.map(({ mode: m, label: l, icon: Icon }) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn("flex items-center gap-1.5 rounded-sm px-4 py-1.5 text-sm text-muted-foreground", mode === m && "bg-[#eaf2ff] font-medium text-primary")}
            >
              <Icon className="size-4" />
              {l}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {mode === "cash"
            ? "Count the money in your wallet. Missing cash is posted as 5199 Beban Tunai Lain-lain (spending you did not record); extra cash as 4199 Pendapatan Lain-lain."
            : "Enter the balance from your bank or e-wallet app. The difference goes to the account you pick, such as an admin fee or interest."}
        </p>

        <Card className="rounded-sm">
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Status err={err} ok={ok} />
              </div>
              <SelectField name="account_id" label="Account" value={accountId} onChange={setAccountId} error={err.fields?.account_id}>
                {targets.map((a) => (
                  <option key={a.id} value={a.id}>{label(a)}</option>
                ))}
              </SelectField>
              <div className="grid gap-1.5">
                <label htmlFor="date" className="text-sm font-medium">Date</label>
                <input
                  id="date"
                  type="date"
                  value={date}
                  onInput={(e) => setDate((e.target as HTMLInputElement).value)}
                  className="h-10 rounded-sm border border-input px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>

              <div className="grid gap-1 rounded-sm bg-[#f7f8fa] p-3 text-sm sm:col-span-2 sm:grid-cols-3">
                <p><span className="block text-muted-foreground">In your books</span><span className="font-semibold tabular-nums">{book === null ? "…" : fmtIDR(book)}</span></p>
                <p><span className="block text-muted-foreground">You counted</span><span className="font-semibold tabular-nums">{actualSen >= 0 ? fmtIDR(actualSen) : "—"}</span></p>
                <p>
                  <span className="block text-muted-foreground">Difference</span>
                  <span className={cn("font-semibold tabular-nums", diff !== null && diff < 0 && "text-destructive", diff !== null && diff > 0 && "text-emerald-700")}>
                    {diff === null ? "—" : diff === 0 ? "Matches" : `${diff > 0 ? "+" : "−"} ${fmtIDR(Math.abs(diff))}`}
                  </span>
                </p>
              </div>

              <Field
                name="actual"
                label={mode === "cash" ? "Cash counted (Rp)" : "Statement balance (Rp)"}
                placeholder="540.000"
                inputMode="decimal"
                value={actual}
                onInput={(e) => setActual((e.target as HTMLInputElement).value)}
                error={err.fields?.actual}
              />
              {mode === "bank" && (
                <SelectField name="counter_account_id" label="Post difference to" value={counterId} onChange={setCounterId} error={err.fields?.counter_account_id}>
                  <option value="">Choose…</option>
                  {counters.map((a) => (
                    <option key={a.id} value={a.id}>{label(a)}</option>
                  ))}
                </SelectField>
              )}

              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy || diff === null} className="h-10 rounded-sm px-8">
                  {busy && <Loader2 className="animate-spin" />}
                  {diff === 0 ? "Confirm match" : "Post difference"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
