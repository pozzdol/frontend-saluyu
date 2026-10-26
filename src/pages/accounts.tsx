import { Archive, ArchiveRestore, Loader2, Pencil, Plus, RefreshCw } from "lucide-react"
import { toast } from "@/components/toast"
import { Input } from "@/components/ui/input"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
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
import { Loading, SkeletonHeading, SkeletonRows } from "@/components/skeleton"

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
  const [editing, setEditing] = useState<string | null>(null)
  const [showArchive, setShowArchive] = useState(false)
  // One layout at a time: rendering both the phone list and the table put two edit forms
  // (two autofocused inputs) on the page, and typing could land in the hidden one.
  const mobile = useIsMobile()
  const [values, setValues] = useState<Record<string, number>>({}) // fixed asset id -> value today
  const [revaluing, setRevaluing] = useState<Account | null>(null)

  // Balances decide whether an account may be archived: one that still holds money may not.
  // The far date counts entries dated ahead too, like the server's check.
  const [balances, setBalances] = useState<Record<string, number>>({})
  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setErr(toFormError(e)))
    getTrialBalance(todayISO()).then((tb) => setValues(Object.fromEntries(tb.rows.map((r) => [r.account_id, r.debit_balance - r.credit_balance])))).catch(() => {})
    getTrialBalance("9999-12-31").then((tb) => setBalances(Object.fromEntries(tb.rows.map((r) => [r.account_id, r.debit_balance - r.credit_balance]))), () => {})
  }, [reload])
  const held = (a: Account) => (a.type === "Asset" || a.type === "Liability" || a.type === "Equity" ? Math.abs(balances[a.id] ?? 0) : 0)

  const saved = (updated: Account) => setAccounts((list) => list?.map((x) => (x.id === updated.id ? { ...updated, uses_30d: x.uses_30d, has_entries: x.has_entries } : x)) ?? null)

  // Archive instead of delete: entries keep pointing at the account, it just leaves the pickers.
  async function setArchived(a: Account, archived: boolean) {
    setErr({})
    try {
      saved(await updateAccount(a.id, { is_active: !archived }))
      if (archived) toast(t("acct.archivedToast", { name: a.name }), { action: { label: t("common.undo"), run: () => setArchived(a, false) } })
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  async function save(a: Account, name: string, category: string, saving?: boolean) {
    setErr({})
    const body: { name?: string; category?: string; saving?: boolean } = {}
    if (name.trim() && name.trim() !== a.name) body.name = name.trim()
    if (category.trim() && category.trim() !== a.category) body.category = category.trim()
    if (saving !== undefined && saving !== (a.kind === "saving")) body.saving = saving
    try {
      if (Object.keys(body).length) saved(await updateAccount(a.id, body))
      setEditing(null)
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  // The edit form: name and group (category). The type stays: it decides which side grows.
  const editForm = (a: Account) => (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
      e.preventDefault()
      const el = (e.currentTarget as HTMLFormElement).elements
      const saving = el.namedItem("saving") as HTMLInputElement | null
      save(a, (el.namedItem("name") as HTMLInputElement).value, (el.namedItem("category") as HTMLInputElement).value, saving ? saving.checked : undefined)
    }}>
      <label className="grid gap-1 text-xs text-muted-foreground">{t("acct.name")}
        <Input name="name" defaultValue={a.name} autoFocus className="h-9 w-48 rounded-sm text-foreground" />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">{t("acct.category")}
        <Input name="category" defaultValue={a.category} className="h-9 w-40 rounded-sm text-foreground" />
      </label>
      {/* Plain assets only: cards and loans have their own kind. */}
      {(a.kind === "general" || a.kind === "saving") && a.type === "Asset" && (
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="saving" defaultChecked={a.kind === "saving"} className="size-4 accent-[#0052d9]" />
          {t("acct.countsAsSaving")}
        </label>
      )}
      <Button type="submit" size="sm" className="h-9 rounded-sm">{t("common.save")}</Button>
      <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
    </form>
  )

  const nameCell = (a: Account) => (
    <span className="flex items-center gap-1">
      <a href={`/app/accounts/${a.id}`} className="font-medium text-primary hover:underline">{a.name}</a>
      <Button variant="ghost" size="icon-sm" aria-label={t("acct.editOf", { name: a.name })} title={t("acct.editOf", { name: a.name })} onClick={() => setEditing(a.id)}><Pencil /></Button>
    </span>
  )

  // Fixed assets show their value and the way to update it.
  const valueCell = (a: Account) => isFixedAsset(a) && (
    <span className="flex items-center gap-2">
      <span className="tabular-nums">{fmtIDR(values[a.id] ?? 0)}</span>
      <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setRevaluing(a)}><RefreshCw /> {t("fa.update")}</Button>
    </span>
  )

  const archived = accounts?.filter((a) => !a.is_active) ?? []
  const active = accounts?.filter((a) => a.is_active) ?? []

  // Fixed assets get their own group under Asset: they are owned, not spendable.
  const groups = typeOrder.flatMap((type): { type: AccountType; fixed: boolean; rows: Account[] }[] => type === "Asset"
    ? [{ type, fixed: false, rows: active.filter((a) => a.type === type && !isFixedAsset(a)) },
       { type, fixed: true, rows: active.filter(isFixedAsset) }]
    : [{ type, fixed: false, rows: active.filter((a) => a.type === type) }])

  const archiveButton = (a: Account) => a.is_active ? (
    held(a) !== 0 ? (
      // Still holds money: the button stays visible and says why it cannot archive.
      <Button variant="ghost" size="sm" aria-disabled="true" title={t("acct.cantArchive", { amount: fmtIDR(held(a)) })}
        className="text-muted-foreground opacity-60" onClick={() => toast(t("acct.cantArchive", { amount: fmtIDR(held(a)) }), { tone: "error" })}>
        <Archive /> {t("acct.archive")}
      </Button>
    ) : (
      <Button variant="ghost" size="sm" onClick={() => setArchived(a, true)}><Archive /> {t("acct.archive")}</Button>
    )
  ) : (
    <Button variant="ghost" size="sm" className="text-primary" onClick={() => setArchived(a, false)}><ArchiveRestore /> {t("acct.restore")}</Button>
  )

  return (
    <AppShell title={t("acct.title")} term="code"
      actions={
        <div className="flex flex-wrap gap-2">
          {archived.length > 0 && (
            <Button variant="ghost" size="sm" className="rounded-sm" onClick={() => setShowArchive(true)}>
              <Archive /> {t("acct.archiveList", { n: archived.length })}
            </Button>
          )}
          {!adding && <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setAdding(true)}><Plus /> {t("acct.add")}</Button>}
        </div>
      }>
      <div className="grid gap-6">
        {adding && <NewAccount accounts={accounts ?? []} onCreated={() => (setReload((n) => n + 1), setAdding(false))} onCancel={() => setAdding(false)} />}
        <Status err={err} ok="" />
        <IndonesianNames onDone={() => setReload((n) => n + 1)} />
        {!accounts && !err.message && (
          <Loading>
            {[4, 3, 2].map((n, i) => <div key={i} className="grid gap-2"><SkeletonHeading /><SkeletonRows rows={n} cols={["short", "text", "text", "short"]} /></div>)}
          </Loading>
        )}

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
              {mobile ? (
              <MobileList>
                {rows.map((a) => editing === a.id ? (
                  <li key={a.id} className="px-4 py-3">{editForm(a)}</li>
                ) : (
                  <MobileItem
                    key={a.id}
                    lead={<IconButton account={a} onSaved={saved} />}
                    title={nameCell(a)}
                    meta={<><span className="tabular-nums">{a.code}</span><span>{a.category}</span>{valueCell(a)}</>}
                    actions={archiveButton(a)}
                  />
                ))}
              </MobileList>
              ) : (
              <TableCard className="[&_table]:table-fixed">
                {/* Fixed layout and the same column widths in every section: Code, Name and Group
                    line up from one table to the next instead of sizing to each table's content. */}
                <thead>
                  <tr>
                    <th className="w-24">{t("acct.code")}</th>
                    <th>{t("acct.name")}</th>
                    <th className="w-56">{t("acct.category")}</th>
                    <th className="w-36"><span className="sr-only">{t("tx.actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => editing === a.id ? (
                    <tr key={a.id}>
                      <td className="tabular-nums">{a.code}</td>
                      <td colSpan={3}>{editForm(a)}</td>
                    </tr>
                  ) : (
                    <tr key={a.id}>
                      <td className="tabular-nums">{a.code}</td>
                      <td>
                        <span className="flex items-center gap-3">
                          <IconButton account={a} onSaved={saved} />
                          {nameCell(a)}
                        </span>
                      </td>
                      <td>{a.category}{fixed && <span className="ml-3">{valueCell(a)}</span>}</td>
                      <td className="text-right">{archiveButton(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
              )}
            </section>
          )
        })}
      </div>

      <Sheet open={showArchive && archived.length > 0} onOpenChange={setShowArchive}>
        <SheetContent side={mobile ? "bottom" : "right"} title={t("acct.archiveTitle")} description={t("acct.archiveHint")}>
          <ul className="grid gap-4 pb-2">
            {typeOrder.map((type) => {
              const list = archived.filter((a) => a.type === type)
              if (list.length === 0) return null
              return (
                <li key={type} className="grid gap-1">
                  <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span className={cn("size-2 rounded-full", typeDot[type])} /> {t(`type.${type}`)}
                  </p>
                  <ul className="divide-y rounded-sm border">
                    {list.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="w-12 text-muted-foreground tabular-nums">{a.code}</span>
                        <span className="min-w-0 flex-1">
                          <a href={`/app/accounts/${a.id}`} className="block truncate font-medium hover:underline">{a.name}</a>
                          <span className="block truncate text-xs text-muted-foreground">{a.category}</span>
                        </span>
                        <Button variant="ghost" size="sm" className="text-primary" onClick={() => setArchived(a, false)}>
                          <ArchiveRestore /> {t("acct.restore")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        </SheetContent>
      </Sheet>
      {revaluing && <RevalueSheet account={revaluing} value={values[revaluing.id] ?? 0} onClose={() => setRevaluing(null)} onDone={() => (setRevaluing(null), setReload((n) => n + 1))} />}
    </AppShell>
  )
}
