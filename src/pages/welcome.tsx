import { ArrowLeft, Check, Loader2, Plus, X } from "lucide-react"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { AmountField, Status, toFormError, type FormError } from "@/components/field"
import { PeriodFields, type PeriodSettings } from "@/components/period-picker"
import { SelectPicker } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import { Logo } from "@/components/site"
import { Loading, Skeleton } from "@/components/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createAccount, listAccounts, putBudget, setOpening, updateAccount, updateProfile, type Account, type User } from "@/lib/api"
import { useT, type Key } from "@/lib/i18n"
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
]
type Provider = { name: string; kind: string; tone: string }
const budgetCodes = ["5102", "5101", "5103"] // Makan, Transportasi, Jajan

// The groups offered; "other" lets people name their own and say how it behaves.
type Group = "Kas & Bank" | "Tabungan" | "E-wallet" | "Investasi" | "other"
const groups: { value: Group; label: Key }[] = [
  { value: "Kas & Bank", label: "wel.gBank" },
  { value: "Tabungan", label: "wel.gSaving" },
  { value: "E-wallet", label: "wel.gWallet" },
  { value: "Investasi", label: "wel.gInvest" },
  { value: "other", label: "wel.gOther" },
]
// Each built-in group has a starter account; the first row in that group takes it over.
const baseCode: Partial<Record<Group, string>> = { "Kas & Bank": "1001", "E-wallet": "1004", Tabungan: "1003", Investasi: "1005" }
const looks: Record<Group, { icon: string; color: string }> = {
  "Kas & Bank": { icon: "landmark", color: "blue" },
  "E-wallet": { icon: "smartphone", color: "violet" },
  Tabungan: { icon: "piggy-bank", color: "teal" },
  Investasi: { icon: "trending-up", color: "indigo" },
  other: { icon: "wallet", color: "slate" },
}

// A row is one account to open: a provider can have several (BCA for daily use, BCA savings).
type Row = { id: string; provider: Provider; name: string; named: boolean; group: Group; custom: string; saving: boolean }

const defaultGroup = (p: Provider): Group => (p.kind === "wallet" ? "E-wallet" : "Kas & Bank")
const groupWord = (t: (k: Key) => string, g: Group, custom: string) => (g === "other" ? custom.trim() : t(groups.find((x) => x.value === g)!.label))
const category = (r: Row) => (r.group === "other" ? r.custom.trim() : r.group)
const savingOf = (r: Row) => (r.group === "other" ? r.saving : r.group === "Tabungan" || r.group === "Investasi")

let seq = 0
const newRow = (p: Provider, group = defaultGroup(p)): Row => ({ id: `r${++seq}`, provider: p, name: p.name, named: false, group, custom: "", saving: false })

// placeAccounts opens one account per row. A row in a built-in group takes over that group's
// starter account (1001 Bank, 1003 Tabungan, 1004 Dompet Digital, 1005 Investasi) while it still has
// its starter name; the rest become new accounts. An account that already has the row's name is
// reused, so finishing again after an error never makes duplicates.
async function placeAccounts(rows: Row[], accounts: Account[]) {
  const ids = new Map<string, string>()
  const byName = (n: string) => accounts.find((a) => a.name.toLowerCase() === n.toLowerCase())
  const starters = new Map(accounts.filter((a) => Object.values(baseCode).includes(a.code)).map((a) => [a.code, a]))
  const starterName: Record<string, string> = { "1001": "Bank", "1003": "Tabungan", "1004": "Dompet Digital", "1005": "Investasi" }
  const used = new Set(accounts.map((a) => a.code))
  let next = 1006
  for (const r of rows) {
    const body = { name: r.name.trim(), category: category(r), saving: savingOf(r) }
    const have = byName(body.name)
    const code = baseCode[r.group]
    const starter = code ? starters.get(code) : undefined
    if (have) ids.set(r.id, (await updateAccount(have.id, { category: body.category, saving: body.saving })).id)
    else if (starter && starter.name === starterName[starter.code]) {
      starters.delete(starter.code) // one row per starter
      ids.set(r.id, (await updateAccount(starter.id, body)).id)
    } else {
      while (used.has(String(next))) next++
      used.add(String(next))
      const a = await createAccount({ code: String(next), type: "Asset", ...body, ...looks[r.group] })
      ids.set(r.id, a.id)
    }
  }
  return ids
}

export function WelcomePage({ user }: { user: User }) {
  const t = useT()
  const { route } = useLocation()
  const [step, setStep] = useState(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [extra, setExtra] = useState<Provider[]>([]) // "+ Bank lain"
  const [otherName, setOtherName] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [period, setPeriod] = useState<PeriodSettings>(user)
  const [unused, setUnused] = useState<string[]>([]) // expense categories the user unticked
  const [budgets, setBudgets] = useState<Record<string, string>>({})
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listAccounts().then(setAccounts, (e) => setErr(toFormError(e)))
  }, [])

  const all = [...providers, ...extra]
  const isOn = (p: Provider) => rows.some((r) => r.provider.name === p.name)
  const toggle = (p: Provider) => setRows((rs) => (rs.some((r) => r.provider.name === p.name) ? rs.filter((r) => r.provider.name !== p.name) : [...rs, newRow(p)]))
  const addOther = () => {
    const name = otherName.trim()
    if (!name || all.some((p) => p.name.toLowerCase() === name.toLowerCase())) return
    const p = { name, kind: "other", tone: "bg-slate-500" }
    setExtra((xs) => [...xs, p])
    setRows((rs) => [...rs, newRow(p)])
    setOtherName("")
  }
  // Changing the group renames an auto-named row ("BCA Tabungan"); a typed name stays.
  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => {
    if (r.id !== id) return r
    const n = { ...r, ...patch }
    if (!n.named && ("group" in patch || "custom" in patch)) {
      const twin = rs.filter((x) => x.provider.name === r.provider.name).length > 1
      n.name = twin ? `${r.provider.name} ${groupWord(t, n.group, n.custom)}`.trim() : r.provider.name
    }
    return n
  }))
  const addTwin = (r: Row) => setRows((rs) => {
    const i = rs.lastIndexOf(rs.filter((x) => x.provider.name === r.provider.name).at(-1)!)
    const twin = { ...newRow(r.provider, "Tabungan") }
    twin.name = `${r.provider.name} ${t("wel.gSaving")}`
    return [...rs.slice(0, i + 1), twin, ...rs.slice(i + 1)]
  })

  // Step 2 checks: every row named, names unique, "other" groups named.
  const names = rows.map((r) => r.name.trim().toLowerCase())
  const rowError = (r: Row): string | undefined =>
    !r.name.trim() ? t("wel.needName")
      : names.filter((n) => n === r.name.trim().toLowerCase()).length > 1 ? t("wel.dupName")
        : r.group === "other" && !r.custom.trim() ? t("wel.needGroup") : undefined
  const rowsOk = rows.every((r) => !rowError(r))

  const cash = accounts.find((a) => a.code === "1002")
  const wallets = [...rows.map((r) => r.id), "cash"] // what the amounts step asks for
  const label = (w: string) => (w === "cash" ? t("wel.cash") : rows.find((r) => r.id === w)?.name ?? "")
  const sen = (s?: string) => (s?.trim() ? toSen(s) : 0)
  const bad = Object.entries(amounts).filter(([k, v]) => wallets.includes(k) && !(sen(v) >= 0)).map(([k]) => k)
  const total = wallets.reduce((s, w) => s + (sen(amounts[w]) || 0), 0)
  // System categories (5108, 5199) are hidden from Quick Add until used, so they are not offered.
  const categories = accounts.filter((a) => a.type === "Expense" && a.is_active && !["5108", "5199"].includes(a.code))
  const budgetAccounts = budgetCodes.map((c) => accounts.find((a) => a.code === c)).filter((a): a is Account => !!a && !unused.includes(a.id))

  async function finish(skipBudgets = false) {
    setBusy(true)
    setErr({})
    try {
      const ids = await placeAccounts(rows, accounts)
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

  const loadingAccounts = accounts.length === 0 && !err.message
  const steps = [t("wel.s1"), t("wel.sGroups"), t("wel.s2"), t("wel.s3"), t("wel.s4")]
  const last = steps.length - 1
  const blocked = (step === 1 && !rowsOk) || (step === 2 && bad.length > 0)
  // No bank chosen: the groups step has nothing to ask, so it is skipped both ways.
  const go = (d: 1 | -1) => setStep((s) => (s + d === 1 && rows.length === 0 ? s + 2 * d : s + d))
  const next = (
    <Button className="h-11 rounded-sm px-8" disabled={busy || blocked} onClick={() => (step < last ? go(1) : finish())}>
      {busy && <Loader2 className="animate-spin" />}
      {step < last ? t("wel.next") : t("wel.finish")}
    </Button>
  )

  return (
    <div className="min-h-svh bg-gradient-to-b from-[#eaf2ff] to-[#f7f8fa] px-4 py-6">
      <div className="mx-auto grid max-w-xl gap-6">
        <Logo />
        <div>
          <p className="text-sm text-muted-foreground">{t("wel.progress", { n: step + 1, total: steps.length })}</p>
          <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
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
                {all.map((p) => {
                  const on = isOn(p)
                  return (
                    <button key={p.name} type="button" aria-pressed={on} onClick={() => toggle(p)}
                      className={cn("relative grid justify-items-center gap-1.5 rounded-sm border p-3 text-xs", on ? "border-primary bg-[#eaf2ff] ring-1 ring-primary" : "hover:bg-muted")}>
                      <span className={cn("grid size-10 place-items-center rounded-full text-sm font-bold text-white", p.tone)}>{p.name.slice(0, 2).toUpperCase()}</span>
                      <span className="max-w-full truncate">{p.name}</span>
                      {on && <Check className="absolute top-1.5 right-1.5 size-4 text-primary" />}
                    </button>
                  )
                })}
              </div>
              {/* A bank or app that is not in the grid: typed in, then chosen like the others. */}
              <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), addOther())}>
                <Input value={otherName} onInput={(e) => setOtherName(e.currentTarget.value)} placeholder={t("wel.otherPlaceholder")}
                  aria-label={t("wel.otherName")} className="h-11 rounded-sm md:h-10" maxLength={100} />
                <Button type="submit" variant="outline" className="h-11 rounded-sm md:h-10" disabled={!otherName.trim()}><Plus /> {t("wel.addOther")}</Button>
              </form>
              <p className="text-xs text-muted-foreground">{t("wel.cashAlways")}</p>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{t("wel.groupsHint")}</p>
              <ul className="grid gap-3">
                {rows.map((r, i) => {
                  const first = rows.findIndex((x) => x.provider.name === r.provider.name) === i
                  const error = rowError(r)
                  return (
                    <li key={r.id} className="grid gap-3 rounded-sm border p-3">
                      <div className="flex items-center gap-3">
                        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white", r.provider.tone)}>{r.provider.name.slice(0, 2).toUpperCase()}</span>
                        <Input value={r.name} aria-label={t("wel.accountName")} aria-invalid={!!error && !r.name.trim()} maxLength={100}
                          onInput={(e) => update(r.id, { name: e.currentTarget.value, named: true })} className="h-10 min-w-0 flex-1 rounded-sm" />
                        {!first && (
                          <Button variant="ghost" size="icon-sm" aria-label={t("wel.removeRow", { name: r.name })} title={t("wel.removeRow", { name: r.name })}
                            onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><X /></Button>
                        )}
                      </div>
                      <div className="grid gap-1.5">
                        <span className="text-xs text-muted-foreground">{t("wel.group")}</span>
                        <SelectPicker title={t("wel.group")} aria-label={t("wel.groupOf", { name: r.name })} value={r.group}
                          onChange={(v) => update(r.id, { group: v as Group })}
                          options={groups.map((g) => ({ value: g.value, label: t(g.label) }))} />
                      </div>
                      {r.group === "other" && (
                        <div className="grid gap-2">
                          <Input value={r.custom} placeholder={t("wel.customPlaceholder")} aria-label={t("wel.customGroup")} maxLength={100}
                            onInput={(e) => update(r.id, { custom: e.currentTarget.value })} className="h-10 rounded-sm" />
                          <Segmented label={t("wel.behaviour")} value={r.saving ? "saving" : "daily"} onChange={(v) => update(r.id, { saving: v === "saving" })}
                            items={[{ value: "daily", label: t("wel.useDaily") }, { value: "saving", label: t("wel.useSaving") }]} />
                          <p className="text-xs text-muted-foreground">{t(r.saving ? "wel.savingHint" : "wel.dailyHint")}</p>
                        </div>
                      )}
                      {error && <p className="text-xs text-destructive">{error}</p>}
                      {first && (
                        <button type="button" onClick={() => addTwin(r)} className="w-fit text-sm text-primary hover:underline">
                          {t("wel.addTwin", { name: r.provider.name })}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-muted-foreground">{t("wel.groupsLater")}</p>
            </div>
          )}

          {step === 2 && (
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

          {step === 3 && (
            <div className="grid gap-2">
              <PeriodFields value={period} onChange={setPeriod} />
              <p className="text-sm text-muted-foreground">{t("wel.s3Hint")}</p>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{t("f12.categories")}</legend>
                {loadingAccounts && (
                  <Loading className="flex flex-wrap gap-2">
                    {[20, 24, 16, 28, 20, 24].map((w, i) => <Skeleton key={i} className="h-9 rounded-full" style={{ width: `${w * 4}px` }} />)}
                  </Loading>
                )}
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
              {loadingAccounts && (
                <Loading className="gap-4">
                  {[0, 1, 2].map((i) => <div key={i} className="grid gap-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-11 w-full md:h-10" /></div>)}
                </Loading>
              )}
              {budgetAccounts.map((a) => (
                <AmountField key={a.id} name={`budget-${a.code}`} label={t("wel.budgetFor", { name: a.name })} placeholder={t("common.optional")}
                  defaultValue={budgets[a.id] ?? ""} onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setBudgets((m) => ({ ...m, [a.id]: v })) }} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => go(-1)} disabled={busy}><ArrowLeft /> {t("common.back")}</Button>
          ) : <span />}
          <div className="flex gap-2">
            {step === last && <Button variant="ghost" disabled={busy} onClick={() => finish(true)}>{t("wel.skip")}</Button>}
            {next}
          </div>
        </div>
      </div>
    </div>
  )
}
