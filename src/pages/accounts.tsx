import { Loader2, Plus } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
import { Switch } from "@/components/ui/switch"
import { Field, SelectField, Status, toFormError, useForm, type FormError } from "@/components/field"
import { Badge } from "@/components/ui/badge"
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

function NewAccount({ onCreated }: { onCreated: () => void }) {
  const t = useT()
  const [type, setType] = useState<AccountType>("Expense")
  const form = useForm(async (v, el) => {
    const a = await createAccount({ code: v.code, name: v.name, type, category: v.category })
    el.reset()
    onCreated()
    return t("acct.added", { code: a.code, name: a.name })
  })

  return (
    <Card className="rounded-sm">
      <CardContent>
        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-[8rem_1fr_10rem_1fr_auto] md:items-end">
          <div className="md:col-span-5">
            <Status err={form.err} ok={form.ok} />
          </div>
          <Field name="code" label={t("acct.code")} placeholder="5109" error={form.err.fields?.code} />
          <Field name="name" label={t("acct.name")} placeholder="Kopi" error={form.err.fields?.name} />
          <SelectField name="type" label={t("acct.type")} value={type} onChange={(v) => setType(v as AccountType)} error={form.err.fields?.type}
            options={typeOrder.map((ty) => ({ value: ty, label: t(`type.${ty}`) }))} />
          <Field name="category" label={t("acct.category")} placeholder="Beban" error={form.err.fields?.category} />
          <Button type="submit" disabled={form.busy} className="h-10 w-full rounded-sm md:w-auto">
            {form.busy ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("common.add")}
          </Button>
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

  return (
    <AppShell title={t("acct.title")} term="code">
      <div className="grid gap-6">
        <NewAccount onCreated={() => setReload((n) => n + 1)} />
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
                    title={<a href={`/app/accounts/${a.id}`} className="text-primary">{a.name}</a>}
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
                    <th className="w-28">{t("acct.status")}</th>
                    <th className="w-40"><span className="sr-only">{t("tx.actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className={cn(!a.is_active && "text-muted-foreground")}>
                      <td className="tabular-nums">{a.code}</td>
                      <td>
                        <span className="flex items-center gap-3">
                          <IconButton account={a} onSaved={saved} />
                          <a href={`/app/accounts/${a.id}`} className="font-medium text-primary hover:underline">{a.name}</a>
                        </span>
                      </td>
                      <td>{a.category}</td>
                      <td>
                        <Badge className={cn("rounded-sm", a.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                          {a.is_active ? t("common.active") : t("common.inactive")}
                        </Badge>
                      </td>
                      <td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => toggle(a)}>
                          {a.is_active ? t("acct.deactivate") : t("acct.activate")}
                        </Button>
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
