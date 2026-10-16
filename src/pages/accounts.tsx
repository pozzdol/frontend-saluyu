import { Loader2, Pencil, Plus } from "lucide-react"
import { toast } from "@/components/toast"
import { Input } from "@/components/ui/input"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
import { Switch } from "@/components/ui/switch"
import { Field, SelectField, Status, toFormError, useForm, type FormError } from "@/components/field"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createAccount, listAccounts, updateAccount, type Account, type AccountType } from "@/lib/api"
import { cn } from "@/lib/utils"
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

export function Accounts() {
  const t = useT()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)
  const [adding, setAdding] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)

  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setErr(toFormError(e)))
  }, [reload])

  const saved = (updated: Account) => setAccounts((list) => list?.map((x) => (x.id === updated.id ? { ...updated, uses_30d: x.uses_30d } : x)) ?? null)

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

  return (
    <AppShell title={t("acct.title")} term="code"
      actions={!adding && <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setAdding(true)}><Plus /> {t("acct.add")}</Button>}>
      <div className="grid gap-6">
        {adding && <NewAccount accounts={accounts ?? []} onCreated={() => (setReload((n) => n + 1), setAdding(false))} onCancel={() => setAdding(false)} />}
        <Status err={err} ok="" />

        {typeOrder.map((type) => {
          const rows = accounts?.filter((a) => a.type === type) ?? []
          if (rows.length === 0) return null
          return (
            <section key={type} aria-labelledby={`type-${type}`} className="grid gap-2">
              <h2 id={`type-${type}`} className="flex items-center gap-2 font-semibold">
                <span className={cn("size-2.5 rounded-full", typeDot[type])} />
                <Term k={({ Asset: "asset", Liability: "liability", Equity: "equity", Revenue: "revenue", Expense: "expense" } as const)[type]}>{t(`type.${type}`)}</Term>
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
                    meta={<><span className="tabular-nums">{a.code}</span><span>{a.category}</span>{!a.is_active && <span>{t("common.inactive")}</span>}</>}
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
                      <td>{a.category}</td>
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
    </AppShell>
  )
}
