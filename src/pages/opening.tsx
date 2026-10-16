import { Info, Loader2, TriangleAlert } from "lucide-react"
import { fmtDate } from "@/components/picker"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { DateField, Status, toFormError, type FormError } from "@/components/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  getOpening,
  listAccounts,
  listContacts,
  perContact,
  setOpening,
  type Account,
  type Contact,
  type Opening,
  type OpeningItem,
  type User,
} from "@/lib/api"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"
import { typeDot } from "@/pages/accounts"
import { Term } from "@/components/term"
import { useT } from "@/lib/i18n"

// Amount inputs are keyed by account id, or "accountId:contactId" for a person's receivable/payable.
const key = (accountId: string, contactId?: string | null) => (contactId ? `${accountId}:${contactId}` : accountId)

// OpeningPage replaces the missing "saldo awal" in the Excel: the real balance of every
// asset and liability on the day the books open. The rest is net worth (3001).
export function OpeningPage({ user }: { user: User }) {
  const t = useT()
  const { route } = useLocation()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [opening, setOpeningState] = useState<Opening | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [contacts, setContacts] = useState<Contact[]>([])
  const [perPerson, setPerPerson] = useState<{ receivable?: Account; payable?: Account }>({})
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([listAccounts(), getOpening(), listContacts()])
      .then(([list, o, people]) => {
        setAccounts(list.filter((a) => (a.type === "Asset" || a.type === "Liability") && !perContact(a.code) && a.is_active))
        setPerPerson({ receivable: list.find((a) => a.code === "1101"), payable: list.find((a) => a.code === "2101") })
        setContacts(people)
        setOpeningState(o)
        // Prefill from an existing opening entry, in rupiah with a decimal comma.
        const prefill: Record<string, string> = {}
        for (const l of o.entry?.lines ?? []) prefill[key(l.account_id, l.contact_id)] = String((l.debit || l.credit) / 100).replace(".", ",")
        setAmounts(prefill)
      })
      .catch((e) => setErr(toFormError(e)))
  }, [])

  const sen = (id: string) => (amounts[id] ? toSen(amounts[id]) : 0)
  const total = (type: Account["type"]) => accounts.filter((a) => a.type === type).reduce((s, a) => s + (sen(a.id) || 0), 0)
  // One item per (account, contact) pair for receivables and payables.
  const personItems: (OpeningItem & { label: string })[] = contacts.flatMap((c) =>
    [perPerson.receivable, perPerson.payable].flatMap((a) =>
      a ? [{ account_id: a.id, contact_id: c.id, amount: sen(key(a.id, c.id)), label: `${c.name} (${a.name})` }] : [],
    ),
  )
  const personTotal = (a?: Account) => personItems.filter((it) => it.account_id === a?.id).reduce((s, it) => s + (it.amount || 0), 0)
  const assets = total("Asset") + personTotal(perPerson.receivable)
  const liabilities = total("Liability") + personTotal(perPerson.payable)
  const invalid = [
    ...accounts.filter((a) => amounts[a.id] && !(sen(a.id) >= 0)).map((a) => a.name),
    ...personItems.filter((it) => !(it.amount >= 0)).map((it) => it.label),
  ]
  const firstTime = !user.start_date

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    const date = (new FormData(e.currentTarget as HTMLFormElement).get("start_date") as string) || ""
    if (invalid.length > 0) {
      setErr({ message: t("open.checkAmount", { names: invalid.join(", ") }) })
      return
    }
    setBusy(true)
    setErr({})
    try {
      const items: OpeningItem[] = [
        ...accounts.map((a) => ({ account_id: a.id, amount: sen(a.id) })),
        ...personItems.filter((it) => it.amount > 0).map(({ account_id, contact_id, amount }) => ({ account_id, contact_id, amount })),
      ]
      await setOpening({ start_date: date, items })
      route("/app/dashboard")
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell title={t("open.title")} term="opening">
      <div className="grid gap-6">
        {firstTime && (
          <Alert className="rounded-sm border-[#cfe0ff] bg-[#f4f8ff]">
            <Info className="text-primary" />
            <AlertDescription className="text-foreground">
              {t("open.welcome")}
            </AlertDescription>
          </Alert>
        )}

        {!firstTime && (
          <Alert className="rounded-sm border-amber-200 bg-amber-50">
            <TriangleAlert className="text-amber-700" />
            <AlertDescription className="grid gap-1.5 text-amber-900">
              <p className="font-medium">{t("open.runningTitle", { date: fmtDate(user.start_date!) })}</p>
              <p>{t("open.runningBody")}</p>
              <p>
                {t("open.smallFix")} <a href="/app/journal" className="font-medium underline">{t("nav.journal")}</a>.
              </p>
              {user.locked_until && <p className="font-medium">{t("open.lockedNote", { date: fmtDate(user.locked_until) })}</p>}
            </AlertDescription>
          </Alert>
        )}
        {(
          <form onSubmit={onSubmit} noValidate className="grid gap-6">
            <Status err={err} ok="" />
            <Card className="rounded-sm">
              <CardContent className="grid gap-4 sm:grid-cols-[14rem_1fr] sm:items-end">
                {/* key: remount once the saved date arrives; defaultValue is only read on mount */}
                <DateField key={opening?.start_date ?? "new"} name="start_date" label={t("open.booksOpen")} defaultValue={opening?.start_date ?? todayISO()} error={err.fields?.start_date} />
                <p className="text-sm text-muted-foreground">
                  {t("open.booksOpenHint")}
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
                    <Term k={type === "Asset" ? "asset" : "liability"}>{type === "Asset" ? t("open.have") : t("open.owe")}</Term>
                  </h2>
                  <TableCard>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.id}>
                          <td className="hidden w-20 text-muted-foreground tabular-nums md:table-cell">{a.code}</td>
                          <td>
                            <label htmlFor={`amt-${a.id}`}>{a.name}</label>
                          </td>
                          <td className="w-40 md:w-56">
                            <Input
                              id={`amt-${a.id}`}
                              inputMode="decimal"
                              placeholder="0"
                              value={amounts[a.id] ?? ""}
                              aria-invalid={invalid.includes(a.name)}
                              onInput={(e) => setAmounts((m) => ({ ...m, [a.id]: (e.target as HTMLInputElement).value }))}
                              className="h-11 rounded-sm text-right tabular-nums md:h-9"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableCard>
                </section>
              )
            })}

            <section className="grid gap-2">
              <h2 className="font-semibold"><Term k="receivable">{t("open.people")}</Term></h2>
              {contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Someone owed you money, or you owed someone, on this date?{" "}
                  <a href="/app/contacts" className="text-primary hover:underline">{t("open.addContacts")}</a>{t("open.thenBack")}
                </p>
              ) : (
                <>
                <ul className="grid gap-3 md:hidden">
                  {contacts.map((c) => (
                    <li key={c.id} className="grid gap-2 rounded-sm border bg-card p-4">
                      <p className="font-medium">{c.name}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[perPerson.receivable, perPerson.payable].map((a) =>
                          a ? (
                            <label key={a.id} className="grid gap-1 text-xs text-muted-foreground">
                              {a.code === "1101" ? t("open.owesYou") : t("open.youOwe")}
                              <Input
                                inputMode="decimal"
                                placeholder="0"
                                value={amounts[key(a.id, c.id)] ?? ""}
                                onInput={(e) => setAmounts((m) => ({ ...m, [key(a.id, c.id)]: (e.target as HTMLInputElement).value }))}
                                className="h-11 rounded-sm text-right tabular-nums"
                              />
                            </label>
                          ) : null,
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <TableCard className="hidden md:block">
                  <thead>
                    <tr>
                      <th>{t("open.contact")}</th>
                      <th className="w-56">{t("open.owesYou")}</th>
                      <th className="w-56">{t("open.youOwe")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        {[perPerson.receivable, perPerson.payable].map((a) =>
                          a ? (
                            <td key={a.id}>
                              <Input
                                aria-label={`${c.name}: ${a.code === "1101" ? t("open.owesYouShort") : t("open.youOweShort")}`}
                                inputMode="decimal"
                                placeholder="0"
                                value={amounts[key(a.id, c.id)] ?? ""}
                                onInput={(e) => setAmounts((m) => ({ ...m, [key(a.id, c.id)]: (e.target as HTMLInputElement).value }))}
                                className="h-9 rounded-sm text-right tabular-nums"
                              />
                            </td>
                          ) : null,
                        )}
                      </tr>
                    ))}
                  </tbody>
                </TableCard>
                </>
              )}
            </section>

            <Card className="rounded-sm">
              <CardContent className="grid gap-2 text-sm tabular-nums sm:max-w-md">
                <p className="flex justify-between"><span>{t("open.totalAssets")}</span><span>{fmtIDR(assets)}</span></p>
                <p className="flex justify-between"><span>{t("open.totalDebts")}</span><span>− {fmtIDR(liabilities)}</span></p>
                <p className="flex justify-between border-t pt-2 font-semibold">
                  <span><Term k="equity">{t("open.netWorth")}</Term></span>
                  <span className={cn(assets - liabilities < 0 && "text-destructive")}>{fmtIDR(assets - liabilities)}</span>
                </p>
              </CardContent>
            </Card>

            <div>
              <Button type="submit" disabled={busy} className="h-10 rounded-sm px-8">
                {busy && <Loader2 className="animate-spin" />}
                {firstTime ? t("open.openBooks") : t("open.save")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  )
}
