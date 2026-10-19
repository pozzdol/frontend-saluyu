import { ArrowLeft, Check, Loader2 } from "lucide-react"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { AmountField, Status, toFormError, type FormError } from "@/components/field"
import { PeriodFields, type PeriodSettings } from "@/components/period-picker"
import { Logo } from "@/components/site"
import { Button } from "@/components/ui/button"
import { createAccount, listAccounts, putBudget, setOpening, updateAccount, updateProfile, type Account, type User } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"

// Initials on a brand-ish color, not the real logos: those are trademarks.
const providers = [
  { name: "BCA", kind: "bank", tone: "bg-blue-700" },
  { name: "Mandiri", kind: "bank", tone: "bg-amber-500" },
  { name: "BRI", kind: "bank", tone: "bg-sky-700" },
  { name: "BNI", kind: "bank", tone: "bg-orange-600" },
  { name: "Jago", kind: "bank", tone: "bg-yellow-500" },
  { name: "SeaBank", kind: "bank", tone: "bg-orange-500" },
  { name: "blu", kind: "bank", tone: "bg-cyan-500" },
  { name: "GoPay", kind: "wallet", tone: "bg-sky-500" },
  { name: "OVO", kind: "wallet", tone: "bg-purple-700" },
  { name: "DANA", kind: "wallet", tone: "bg-blue-500" },
  { name: "ShopeePay", kind: "wallet", tone: "bg-orange-600" },
] as const

type Provider = (typeof providers)[number]
const budgetCodes = ["5102", "5101", "5103"] // Makan, Transportasi, Jajan

// placeAccounts turns the chosen providers into accounts: the first bank takes over 1001 "Bank",
// the first e-wallet 1004 "Dompet Digital", the rest become new accounts. An account that already has
// the name is reused, so finishing again after an error never makes duplicates.
async function placeAccounts(chosen: Provider[], accounts: Account[]) {
  const ids = new Map<string, string>()
  const byName = (n: string) => accounts.find((a) => a.name.toLowerCase() === n.toLowerCase())
  const used = new Set(accounts.map((a) => a.code))
  let next = 1006
  for (const kind of ["bank", "wallet"] as const) {
    const base = accounts.find((a) => a.code === (kind === "bank" ? "1001" : "1004"))
    for (const [i, p] of chosen.filter((p) => p.kind === kind).entries()) {
      const have = byName(p.name)
      if (have) ids.set(p.name, have.id)
      else if (i === 0 && base) ids.set(p.name, (await updateAccount(base.id, { name: p.name })).id)
      else {
        while (used.has(String(next))) next++
        used.add(String(next))
        const a = await createAccount({ code: String(next), name: p.name, type: "Asset", category: "Kas & Bank",
          icon: kind === "bank" ? "landmark" : "smartphone", color: kind === "bank" ? "blue" : "violet" })
        ids.set(p.name, a.id)
      }
    }
  }
  return ids
}

export function WelcomePage({ user }: { user: User }) {
  const t = useT()
  const { route } = useLocation()
  const [step, setStep] = useState(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [period, setPeriod] = useState<PeriodSettings>(user)
  const [unused, setUnused] = useState<string[]>([]) // expense categories the user unticked
  const [budgets, setBudgets] = useState<Record<string, string>>({})
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listAccounts().then(setAccounts, (e) => setErr(toFormError(e)))
  }, [])

  const cash = accounts.find((a) => a.code === "1002")
  const picked = providers.filter((p) => chosen.includes(p.name))
  const wallets = [...picked.map((p) => p.name), "cash"] // what step 2 asks amounts for
  const label = (w: string) => (w === "cash" ? t("wel.cash") : w)
  const sen = (s?: string) => (s?.trim() ? toSen(s) : 0)
  const bad = Object.entries(amounts).filter(([, v]) => !(sen(v) >= 0)).map(([k]) => k)
  const total = wallets.reduce((s, w) => s + (sen(amounts[w]) || 0), 0)
  // System categories (5108, 5199) are hidden from Quick Add until used, so they are not offered.
  const categories = accounts.filter((a) => a.type === "Expense" && a.is_active && !["5108", "5199"].includes(a.code))
  const budgetAccounts = budgetCodes.map((c) => accounts.find((a) => a.code === c)).filter((a): a is Account => !!a && !unused.includes(a.id))

  async function finish(skipBudgets = false) {
    setBusy(true)
    setErr({})
    try {
      const ids = await placeAccounts(picked, accounts)
      if (cash) ids.set("cash", cash.id)
      const today = todayISO()
      const items = wallets.map((w) => ({ account_id: ids.get(w)!, amount: sen(amounts[w]) })).filter((i) => i.amount > 0)
      const changed = (Object.keys(period) as (keyof PeriodSettings)[]).filter((k) => period[k] !== user[k])
      if (changed.length > 0) await updateProfile(Object.fromEntries(changed.map((k) => [k, period[k]])))
      // Unticked categories are archived: out of Quick Add and forms, back on from Accounts.
      for (const id of unused) await updateAccount(id, { is_active: false })
      await setOpening({ start_date: today, items })
      for (const a of skipBudgets ? [] : budgetAccounts) {
        const amount = sen(budgets[a.id])
        if (amount > 0) await putBudget(a.id, { date: today, amount })
      }
      route("/app/dashboard", true)
    } catch (e) {
      setErr(toFormError(e))
      listAccounts().then(setAccounts, () => {}) // renamed/created accounts are reused on retry
    } finally {
      setBusy(false)
    }
  }

  const steps = [t("wel.s1"), t("wel.s2"), t("wel.s3"), t("wel.s4")]
  const next = (
    <Button className="h-11 rounded-sm px-8" disabled={busy || (step === 1 && bad.length > 0)} onClick={() => (step < 3 ? setStep(step + 1) : finish())}>
      {busy && <Loader2 className="animate-spin" />}
      {step < 3 ? t("wel.next") : t("wel.finish")}
    </Button>
  )

  return (
    <div className="min-h-svh bg-gradient-to-b from-[#eaf2ff] to-[#f7f8fa] px-4 py-6">
      <div className="mx-auto grid max-w-xl gap-6">
        <Logo />
        <div>
          <p className="text-sm text-muted-foreground">{t("wel.progress", { n: step + 1, total: 4 })}</p>
          <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden="true">
            {steps.map((s, i) => <span key={s} className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />)}
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{steps[step]}</h1>
        </div>

        <div className="rounded-sm border bg-card p-4 md:p-6">
          <Status err={err} ok="" />
          {step === 0 && (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{t("wel.s1Hint")}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {providers.map((p) => {
                  const on = chosen.includes(p.name)
                  return (
                    <button key={p.name} type="button" aria-pressed={on}
                      onClick={() => setChosen((cs) => (cs.includes(p.name) ? cs.filter((c) => c !== p.name) : [...cs, p.name]))}
                      className={cn("relative grid justify-items-center gap-1.5 rounded-sm border p-3 text-xs", on ? "border-primary bg-[#eaf2ff] ring-1 ring-primary" : "hover:bg-muted")}>
                      <span className={cn("grid size-10 place-items-center rounded-full text-sm font-bold text-white", p.tone)}>{p.name.slice(0, 2).toUpperCase()}</span>
                      {p.name}
                      {on && <Check className="absolute top-1.5 right-1.5 size-4 text-primary" />}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t("wel.cashAlways")}</p>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{t("wel.s2Hint")}</p>
              {wallets.map((w) => (
                <AmountField key={w} name={`amount-${w}`} label={`${label(w)} (Rp)`} placeholder="0" defaultValue={amounts[w] ?? ""}
                  onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setAmounts((m) => ({ ...m, [w]: v })) }}
                  error={bad.includes(w) ? t("field.invalid") : undefined} />
              ))}
              <p className="flex justify-between border-t pt-3 text-sm font-medium"><span>{t("common.total")}</span><span className="tabular-nums">{fmtIDR(total)}</span></p>
              <p className="text-xs text-muted-foreground">
                {t("wel.debtsLater")} <a href="/app/opening" className="text-primary hover:underline">{t("wel.fullForm")}</a>
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-2">
              <PeriodFields value={period} onChange={setPeriod} />
              <p className="text-sm text-muted-foreground">{t("wel.s3Hint")}</p>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{t("f12.categories")}</legend>
                <div className="flex flex-wrap gap-2">
                  {categories.map((a) => {
                    const on = !unused.includes(a.id)
                    return (
                      <button key={a.id} type="button" aria-pressed={on}
                        onClick={() => setUnused((u) => (on ? [...u, a.id] : u.filter((x) => x !== a.id)))}
                        className={cn("flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm md:min-h-9", on ? "border-primary bg-[#eaf2ff] text-primary" : "text-muted-foreground hover:bg-muted")}>
                        {on && <Check className="size-4" />}
                        {a.name}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{t("f12.categoriesHint")}</p>
              </fieldset>
              <p className="text-sm text-muted-foreground">{t("wel.s4Hint")}</p>
              {budgetAccounts.map((a) => (
                <AmountField key={a.id} name={`budget-${a.code}`} label={t("wel.budgetFor", { name: a.name })} placeholder={t("common.optional")}
                  defaultValue={budgets[a.id] ?? ""} onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setBudgets((m) => ({ ...m, [a.id]: v })) }} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft /> {t("common.back")}</Button>
          ) : <span />}
          <div className="flex gap-2">
            {step === 3 && <Button variant="ghost" disabled={busy} onClick={() => finish(true)}>{t("wel.skip")}</Button>}
            {next}
          </div>
        </div>
      </div>
    </div>
  )
}
