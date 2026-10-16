import { Loader2, Plus } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Field, SelectField, Status, toFormError, useForm, type FormError } from "@/components/field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createAccount, listAccounts, updateAccount, type Account, type AccountType } from "@/lib/api"
import { cn } from "@/lib/utils"

export const typeOrder: AccountType[] = ["Asset", "Liability", "Equity", "Revenue", "Expense"]

export const typeDot: Record<AccountType, string> = {
  Asset: "bg-sky-500",
  Liability: "bg-amber-500",
  Equity: "bg-violet-500",
  Revenue: "bg-emerald-500",
  Expense: "bg-rose-500",
}

function NewAccount({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<AccountType>("Expense")
  const form = useForm(async (v, el) => {
    const a = await createAccount({ code: v.code, name: v.name, type, category: v.category })
    el.reset()
    onCreated()
    return `Account ${a.code} · ${a.name} added.`
  })

  return (
    <Card className="rounded-sm">
      <CardContent>
        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-[8rem_1fr_10rem_1fr_auto] md:items-end">
          <div className="md:col-span-5">
            <Status err={form.err} ok={form.ok} />
          </div>
          <Field name="code" label="Code" placeholder="5108" error={form.err.fields?.code} />
          <Field name="name" label="Name" placeholder="Kopi" error={form.err.fields?.name} />
          <SelectField name="type" label="Type" value={type} onChange={(v) => setType(v as AccountType)} error={form.err.fields?.type}>
            {typeOrder.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </SelectField>
          <Field name="category" label="Category" placeholder="Beban" error={form.err.fields?.category} />
          <Button type="submit" disabled={form.busy} className="h-10 rounded-sm">
            {form.busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)

  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setErr(toFormError(e)))
  }, [reload])

  async function toggle(a: Account) {
    setErr({})
    try {
      const updated = await updateAccount(a.id, { is_active: !a.is_active })
      setAccounts((list) => list?.map((x) => (x.id === a.id ? updated : x)) ?? null)
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  return (
    <AppShell title="Accounts">
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
                {type}
                <span className="text-xs font-normal text-muted-foreground">normal balance {rows[0].normal_balance.toLowerCase()}</span>
              </h2>
              <TableCard>
                <thead>
                  <tr>
                    <th className="w-24">Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th className="w-28">Status</th>
                    <th className="w-40"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className={cn(!a.is_active && "text-muted-foreground")}>
                      <td className="tabular-nums">{a.code}</td>
                      <td>
                        <a href={`/app/accounts/${a.id}`} className="font-medium text-primary hover:underline">{a.name}</a>
                      </td>
                      <td>{a.category}</td>
                      <td>
                        <Badge className={cn("rounded-sm", a.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground")}>
                          {a.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => toggle(a)}>
                          {a.is_active ? "Deactivate" : "Activate"}
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
