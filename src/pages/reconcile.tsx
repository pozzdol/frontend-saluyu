import { Loader2, ScanSearch, Wallet } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell } from "@/components/app-shell"
import { DateField, Field, SelectField, Status, accountOptions, toFormError, type FormError } from "@/components/field"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cashCount, getBalance, listAccounts, reconcile, type Account } from "@/lib/api"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"
import { Info } from "@/components/term"
import { useT } from "@/lib/i18n"

type Mode = "cash" | "bank"

const perContact = new Set(["1101", "2101"])

// ReconcilePage fixes the Excel problem of cash that never went down: count what you really
// have, and the gap becomes an entry (unrecorded spending, found money, or a bank fee).
export function ReconcilePage() {
  const t = useT()
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
      if (res.diff === 0) setOk(t("rec.matched"))
      else {
        const entry = res.entry!
        const other = entry.lines.find((l) => l.account_id !== accountId)!
        setOk(t("rec.posted", { amount: fmtIDR(Math.abs(res.diff)), account: `${other.code} · ${other.name}`, no: entry.entry_no }))
      }
      setActual("")
      setReload((n) => n + 1)
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  const tabs: { mode: Mode; label: string; icon: typeof Wallet }[] = [
    { mode: "cash", label: t("rec.cash"), icon: Wallet },
    { mode: "bank", label: t("rec.bank"), icon: ScanSearch },
  ]

  return (
    <AppShell title={t("rec.title")} term="reconcile">
      <div className="grid max-w-3xl gap-6">
        <Segmented
          label={t("rec.tabs")}
          value={mode}
          onChange={setMode}
          items={tabs.map(({ mode: m, label: l, icon: Icon }) => ({ value: m, label: <><Icon className="size-4" />{l}</> }))}
        />

        <p className="text-sm text-muted-foreground">
          {mode === "cash"
            ? <>{t("rec.cashIntro")} <Info k="cashCount" /></>
            : t("rec.bankIntro")}
        </p>

        <Card className="rounded-sm">
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Status err={err} ok={ok} />
              </div>
              <SelectField name="account_id" label={t("rec.account")} value={accountId} onChange={setAccountId} options={accountOptions(targets)} error={err.fields?.account_id} />
              <DateField name="date" label={t("common.date")} value={date} onChange={setDate} />

              <div className="grid grid-cols-3 gap-2 rounded-sm bg-[#f7f8fa] p-3 text-sm sm:col-span-2">
                <p><span className="block text-muted-foreground">{t("rec.inBooks")}</span><span className="font-semibold tabular-nums">{book === null ? "…" : fmtIDR(book)}</span></p>
                <p><span className="block text-muted-foreground">{t("rec.counted")}</span><span className="font-semibold tabular-nums">{actualSen >= 0 ? fmtIDR(actualSen) : "—"}</span></p>
                <p>
                  <span className="block text-muted-foreground">{t("rec.difference")}</span>
                  <span className={cn("font-semibold tabular-nums", diff !== null && diff < 0 && "text-destructive", diff !== null && diff > 0 && "text-emerald-700")}>
                    {diff === null ? "—" : diff === 0 ? t("rec.matches") : `${diff > 0 ? "+" : "−"} ${fmtIDR(Math.abs(diff))}`}
                  </span>
                </p>
              </div>

              <Field
                name="actual"
                label={mode === "cash" ? t("rec.cashCounted") : t("rec.statement")}
                placeholder="540.000"
                inputMode="decimal"
                value={actual}
                onInput={(e) => setActual((e.target as HTMLInputElement).value)}
                error={err.fields?.actual}
              />
              {mode === "bank" && (
                <SelectField name="counter_account_id" label={t("rec.postTo")} value={counterId} onChange={setCounterId}
                  options={accountOptions(counters)} placeholder={t("common.choose")} error={err.fields?.counter_account_id} />
              )}

              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy || diff === null} className="h-10 w-full rounded-sm px-8 md:w-auto">
                  {busy && <Loader2 className="animate-spin" />}
                  {diff === 0 ? t("rec.confirm") : t("rec.postDiff")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
