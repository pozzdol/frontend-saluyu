import { Loader2, Pencil, Plus, RefreshCw } from "lucide-react"
import { toast } from "@/components/toast"
import { Input } from "@/components/ui/input"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
import { Switch } from "@/components/ui/switch"
import { Field, SelectField, Status, toFormError, useForm, type FormError } from "@/components/field"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ApiError, createAccount, getTrialBalance, isFixedAsset, listAccounts, revalueAsset, updateAccount, type Account, type AccountType } from "@/lib/api"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useIsMobile } from "@/components/picker"
import { AmountField, DateField } from "@/components/field"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"
import { Info, Term } from "@/components/term"
import { useT } from "@/lib/i18n"
import { IconButton } from "@/components/account-icon"

export const typeOrder: AccountType[] = ["Asset", "Liability", "Equity", "Revenue", "Expense"]

export const typeDot: Record<AccountType, string> = {
  Asset: "bg-sky-500",
  Liability: "bg-amber-500",
  Equity: "bg-violet-500",
  Revenue: "bg-emerald-500",
  Expense: "bg-rose-500",
}

// Codes start with the type's digit (1 Asset … 5 Expense); a new account gets the next free one.
const typeDigit: Record<AccountType, string> = { Asset: "1", Liability: "2", Equity: "3", Revenue: "4", Expense: "5" }
const defaultGroup: Record<AccountType, string> = { Asset: "Kas & Bank", Liability: "Utang", Equity: "Ekuitas", Revenue: "Pendapatan", Expense: "Beban" }

export function nextCode(accounts: Account[], type: AccountType) {
  const used = new Set(accounts.map((a) => a.code))
  const same = accounts.filter((a) => a.code.startsWith(typeDigit[type])).map((a) => Number(a.code)).filter(Number.isFinite)
  let n = same.length ? Math.max(...same) + 1 : Number(typeDigit[type] + "001")
  while (used.has(String(n))) n++
  return String(n)
}

function NewAccount({ accounts, onCreated, onCancel }: { accounts: Account[]; onCreated: () => void; onCancel: () => void }) {
  const t = useT()
  const [type, setType] = useState<AccountType>("Expense")
  const form = useForm(async (v, el) => {
    const a = await createAccount({ code: v.code.trim() || nextCode(accounts, type), name: v.name, type, category: v.category.trim() || defaultGroup[type] })
    el.reset()
    onCreated()
    toast(t("acct.added", { code: a.code, name: a.name }))
    return ""
  })

  return (
    <Card className="rounded-sm">
      <CardContent>
        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-[8rem_1fr_10rem_1fr_auto] md:items-end">
          <div className="md:col-span-5">
            <Status err={form.err} ok={form.ok} />
          </div>
          <Field key={type} name="code" label={t("acct.code")} defaultValue={nextCode(accounts, type)} error={form.err.fields?.code} />
          <Field name="name" label={t("acct.name")} placeholder="Kopi" error={form.err.fields?.name} />
          <SelectField name="type" label={t("acct.type")} value={type} onChange={(v) => setType(v as AccountType)} error={form.err.fields?.type}
            options={typeOrder.map((ty) => ({ value: ty, label: t(`type.${ty}`) }))} />
          <Field key={`g-${type}`} name="category" label={t("acct.category")} defaultValue={defaultGroup[type]} error={form.err.fields?.category} />
          <div className="flex gap-2">
            <Button type="submit" disabled={form.busy} className="h-10 flex-1 rounded-sm md:flex-none">
              {form.busy && <Loader2 className="animate-spin" />}
              {t("common.save")}
            </Button>
            <Button type="button" variant="ghost" className="h-10" onClick={onCancel}>{t("common.cancel")}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// RevalueSheet sets a fixed asset's current value; the server books the difference to equity.
function RevalueSheet({ account, value, onClose, onDone }: { account: Account; value: number; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const mobile = useIsMobile()
  const form = useForm(async (v) => {
    const sen = toSen(v.value)
    if (!v.value.trim() || !(sen >= 0)) throw new ApiError(400, "validation failed", undefined, "validation", { value: "positiveAmount" })
    await revalueAsset(account.id, { value: sen, entry_date: v.entry_date })
    onDone()
    toast(t("fa.updated", { name: account.name }))
    return ""
  })
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={mobile ? "bottom" : "right"} title={t("fa.title", { name: account.name })}>
        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 pb-2">
          <Status err={form.err} ok="" />
          <p className="text-sm text-muted-foreground">{t("fa.hint", { value: fmtIDR(value) })}</p>
          <AmountField name="value" label={t("fa.newValue")} placeholder="18.000.000" error={form.err.fields?.value} />
          <DateField name="entry_date" label={t("common.date")} defaultValue={todayISO()} />
          <Button type="submit" disabled={form.busy} className="h-11 rounded-sm">
            {form.busy && <Loader2 className="animate-spin" />}
            {t("common.save")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// Books seeded before Fase 12 kept English default names. Only an account still carrying
// exactly that name is renamed; a name the user chose stays.
const englishNames: Record<string, [string, string]> = { "1002": ["Cash", "Tunai"], "1004": ["E-wallet", "Dompet Digital"], "5107": ["Admin", "Biaya Admin Bank"] }
const namesKey = "saluyu.idNamesDismissed"

// IndonesianNames offers to rename those accounts in one tap, until done or dismissed.
export function IndonesianNames({ onDone }: { onDone?: () => void }) {
  const t = useT()
  const [old, setOld] = useState<Account[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})
  useEffect(() => {
    try {
      if (localStorage.getItem(namesKey) === "1") return
    } catch {
      /* private mode: ask every time */
    }
    listAccounts().then((list) => setOld(list.filter((a) => englishNames[a.code]?.[0] === a.name)), () => {})
  }, [])
  if (old.length === 0) return null
  const dismiss = () => {
    try {
      localStorage.setItem(namesKey, "1")
    } catch {
      /* private mode */
    }
    setOld([])
  }
  async function rename() {
    setBusy(true)
    try {
      for (const a of old) await updateAccount(a.id, { name: englishNames[a.code][1] })
      setOld([])
      toast(t("f12.renamed"))
      onDone?.()
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="grid gap-2 rounded-sm border border-[#cfe0ff] bg-[#f4f8ff] p-4 text-sm">
      <h2 className="font-semibold">{t("f12.renameTitle")}</h2>
      <p className="text-muted-foreground">{t("f12.renameBody", { names: old.map((a) => `${a.name} → ${englishNames[a.code][1]}`).join(", ") })}</p>
      <Status err={err} ok="" />
      <div className="flex gap-2">
        <Button size="sm" className="rounded-sm" disabled={busy} onClick={rename}>{busy && <Loader2 className="animate-spin" />}{t("f12.renameYes")}</Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>{t("f12.renameNo")}</Button>
      </div>
    </section>
  )
}

export function Accounts() {
  const t = useT()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)
  const [adding, setAdding] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, number>>({}) // fixed asset id -> value today
  const [revaluing, setRevaluing] = useState<Account | null>(null)

  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setErr(toFormError(e)))
    getTrialBalance(todayISO()).then((tb) => setValues(Object.fromEntries(tb.rows.map((r) => [r.account_id, r.debit_balance - r.credit_balance])))).catch(() => {})
  }, [reload])

  const saved = (updated: Account) => setAccounts((list) => list?.map((x) => (x.id === updated.id ? { ...updated, uses_30d: x.uses_30d, has_entries: x.has_entries } : x)) ?? null)

  async function toggle(a: Account) {
    setErr({})
    try {
      saved(await updateAccount(a.id, { is_active: !a.is_active }))
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  async function rename(a: Account, name: string) {
    setErr({})
    try {
      if (name.trim() && name.trim() !== a.name) saved(await updateAccount(a.id, { name: name.trim() }))
      setNaming(null)
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  // Name, or the inline box that renames it.
  const nameCell = (a: Account) => naming === a.id ? (
    <form className="flex items-center gap-2" onSubmit={(e) => (e.preventDefault(), rename(a, ((e.currentTarget as HTMLFormElement).elements.namedItem("name") as HTMLInputElement).value))}>
      <Input name="name" defaultValue={a.name} autoFocus aria-label={t("acct.renameOf", { name: a.name })} className="h-9 w-44 rounded-sm" />
      <Button type="submit" size="sm" className="rounded-sm">{t("common.save")}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setNaming(null)}>{t("common.cancel")}</Button>
    </form>
  ) : (
    <span className="flex items-center gap-1">
      <a href={`/app/accounts/${a.id}`} className="font-medium text-primary hover:underline">{a.name}</a>
      <Button variant="ghost" size="icon-sm" aria-label={t("acct.renameOf", { name: a.name })} title={t("acct.renameOf", { name: a.name })} onClick={() => setNaming(a.id)}><Pencil /></Button>
    </span>
  )

  // Fixed assets show their value and the way to update it.
  const valueCell = (a: Account) => isFixedAsset(a) && (
    <span className="flex items-center gap-2">
      <span className="tabular-nums">{fmtIDR(values[a.id] ?? 0)}</span>
      <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setRevaluing(a)}><RefreshCw /> {t("fa.update")}</Button>
    </span>
  )

  // Fixed assets get their own group under Asset: they are owned, not spendable.
  const groups = typeOrder.flatMap((type): { type: AccountType; fixed: boolean; rows: Account[] }[] => type === "Asset"
    ? [{ type, fixed: false, rows: accounts?.filter((a) => a.type === type && !isFixedAsset(a)) ?? [] },
       { type, fixed: true, rows: accounts?.filter(isFixedAsset) ?? [] }]
    : [{ type, fixed: false, rows: accounts?.filter((a) => a.type === type) ?? [] }])

  return (
    <AppShell title={t("acct.title")} term="code"
      actions={!adding && <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setAdding(true)}><Plus /> {t("acct.add")}</Button>}>
      <div className="grid gap-6">
        {adding && <NewAccount accounts={accounts ?? []} onCreated={() => (setReload((n) => n + 1), setAdding(false))} onCancel={() => setAdding(false)} />}
        <Status err={err} ok="" />
        <IndonesianNames onDone={() => setReload((n) => n + 1)} />

        {groups.map(({ type, fixed, rows }) => {
          if (rows.length === 0) return null
          const gid = fixed ? "fixed" : type
          return (
            <section key={gid} aria-labelledby={`type-${gid}`} className="grid gap-2">
              <h2 id={`type-${gid}`} className="flex items-center gap-2 font-semibold">
                <span className={cn("size-2.5 rounded-full", typeDot[type])} />
                {fixed ? t("fa.group") : <Term k={({ Asset: "asset", Liability: "liability", Equity: "equity", Revenue: "revenue", Expense: "expense" } as const)[type]}>{t(`type.${type}`)}</Term>}
                <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  {t("acct.growsOn", { side: rows[0].normal_balance === "Debit" ? "debit" : t("glossary.credit.label").toLowerCase() })}
                  <Info k="normalBalance" />
                </span>
              </h2>
              <MobileList>
                {rows.map((a) => (
                  <MobileItem
                    key={a.id}
                    lead={<IconButton account={a} onSaved={saved} />}
                    title={nameCell(a)}
                    meta={<><span className="tabular-nums">{a.code}</span><span>{a.category}</span>{valueCell(a)}{!a.is_active && <span>{t("common.inactive")}</span>}</>}
                    value={<Switch checked={a.is_active} onCheckedChange={() => toggle(a)} aria-label={t("acct.activeToggle", { name: a.name })} />}
                  />
                ))}
              </MobileList>
              <TableCard className="hidden md:block">
                <thead>
                  <tr>
                    <th className="w-24">{t("acct.code")}</th>
                    <th>{t("acct.name")}</th>
                    <th>{t("acct.category")}</th>
                    <th className="w-36">{t("acct.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className={cn(!a.is_active && "text-muted-foreground")}>
                      <td className="tabular-nums">{a.code}</td>
                      <td>
                        <span className="flex items-center gap-3">
                          <IconButton account={a} onSaved={saved} />
                          {nameCell(a)}
                        </span>
                      </td>
                      <td>{a.category}{fixed && <span className="ml-3">{valueCell(a)}</span>}</td>
                      <td>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch checked={a.is_active} onCheckedChange={() => toggle(a)} aria-label={t("acct.activeToggle", { name: a.name })} />
                          {a.is_active ? t("common.active") : t("common.inactive")}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            </section>
          )
        })}
      </div>
      {revaluing && <RevalueSheet account={revaluing} value={values[revaluing.id] ?? 0} onClose={() => setRevaluing(null)} onDone={() => (setRevaluing(null), setReload((n) => n + 1))} />}
    </AppShell>
  )
}
