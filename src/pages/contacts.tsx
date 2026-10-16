import { HandCoins, Loader2, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react"
import { EntryDetailSheet } from "@/components/entry-detail"
import { toast } from "@/components/toast"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
import { AmountField, DateField, Field, SelectField, Status, accountOptions, toFormError, useForm, type FormError } from "@/components/field"
import { SelectPicker, fmtDate } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ApiError,
  createContact,
  deleteContact,
  deleteEntry,
  getContact,
  linkContact,
  listAccounts,
  listGroups,
  useAuth,
  whatsapp,
  listContacts,
  perContact,
  postLoan,
  renameContact,
  type Account,
  type Contact,
  type ContactDetail,
  type LoanInput,
  type LoanType,
  type Member,
} from "@/lib/api"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"
import { kindBadge } from "@/pages/transactions"
import { t, useT, type Key } from "@/lib/i18n"

// LinkMember ties a contact to a member of one of my groups: their book then mirrors our loans.
function LinkMember({ contact, onChange }: { contact: Contact; onChange: () => void }) {
  const t = useT()
  const { user } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    listGroups()
      .then((groups) => {
        const seen = new Map<string, Member>()
        for (const g of groups) for (const m of g.members) if (m.id !== user?.id) seen.set(m.id, m)
        setMembers([...seen.values()])
      })
      .catch(() => {})
  }, [])

  async function change(value: string) {
    setErr({})
    try {
      await linkContact(contact.id, value || null)
      onChange()
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  if (members.length === 0 && !contact.linked_user_id) return null
  return (
    <div className="grid gap-2">
      <div className="grid max-w-md gap-1 text-sm">
        <span className="font-medium" id="linked-label">{t("ct.linked")}</span>
        <SelectPicker
          aria-label={t("ct.linked")}
          title={t("ct.linked")}
          value={contact.linked_user_id ?? ""}
          onChange={change}
          options={[{ value: "", label: t("ct.notLinked") }, ...members.map((m) => ({ value: m.id, label: m.name, hint: m.email }))]}
        />
        <span className="text-xs text-muted-foreground">
          {t("ct.linkedHint", { name: contact.name })}
        </span>
      </div>
      <Status err={err} ok="" />
    </div>
  )
}

// NetText says who owes whom in words, so the sign is never the only signal.
function NetText({ net, className }: { net: number; className?: string }) {
  const t = useT()
  if (net === 0) return <span className={cn("text-muted-foreground", className)}>{t("ct.settled")}</span>
  return (
    <span className={cn(net > 0 ? "text-emerald-700" : "text-rose-700", className)}>
      {net > 0 ? t("ct.owesYou", { amount: fmtIDR(net) }) : t("ct.youOwe", { amount: fmtIDR(-net) })}
    </span>
  )
}

export function ContactsPage() {
  const t = useT()
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)

  useEffect(() => {
    listContacts().then(setContacts).catch((e) => setErr(toFormError(e)))
  }, [reload])

  const form = useForm(async (v, el) => {
    const c = await createContact(v.name)
    el.reset()
    setReload((n) => n + 1)
    return t("ct.added", { name: c.name })
  })

  const owedToMe = contacts?.reduce((s, c) => s + c.receivable, 0) ?? 0
  const iOwe = contacts?.reduce((s, c) => s + c.payable, 0) ?? 0

  return (
    <AppShell title={t("ct.title")} term="receivable">
      <div className="grid gap-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("ct.intro")}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-sm"><CardContent>
            <p className="text-sm text-muted-foreground">{t("ct.othersOwe")}</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700 tabular-nums">{fmtIDR(owedToMe)}</p>
          </CardContent></Card>
          <Card className="rounded-sm"><CardContent>
            <p className="text-sm text-muted-foreground">{t("ct.youOweOthers")}</p>
            <p className="mt-1 text-xl font-semibold text-rose-700 tabular-nums">{fmtIDR(iOwe)}</p>
          </CardContent></Card>
        </div>

        <Card className="rounded-sm">
          <CardContent>
            <form onSubmit={form.onSubmit} noValidate className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="sm:col-span-2"><Status err={form.err} ok={form.ok} /></div>
              <Field name="name" label={t("ct.newContact")} placeholder="Bayu" error={form.err.fields?.name} />
              <Button type="submit" disabled={form.busy} className="h-10 rounded-sm">
                {form.busy ? <Loader2 className="animate-spin" /> : <Plus />}
                {t("ct.add")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Status err={err} ok="" />
        {contacts && (
          <MobileList empty={contacts.length === 0 ? t("ct.empty") : undefined}>
            {contacts.map((c) => (
              <MobileItem key={c.id} href={`/app/contacts/${c.id}`} title={c.name}
                meta={c.receivable && c.payable ? <span>{t("ct.bothMeta", { a: fmtIDR(c.receivable), b: fmtIDR(c.payable) })}</span> : undefined}
                value={<NetText net={c.net} className="text-sm" />} />
            ))}
          </MobileList>
        )}
        {contacts && (
          <TableCard className="hidden md:block">
            <thead>
              <tr>
                <th>{t("ct.name")}</th>
                <th className="text-right!">{t("ct.owesYouCol")}</th>
                <th className="text-right!">{t("ct.youOweCol")}</th>
                <th className="text-right!">{t("ct.position")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td><a href={`/app/contacts/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</a></td>
                  <td className="text-right">{c.receivable ? fmtIDR(c.receivable) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-right">{c.payable ? fmtIDR(c.payable) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-right"><NetText net={c.net} /></td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr><td colSpan={4} className="py-10! text-center text-muted-foreground">{t("ct.empty")}</td></tr>
              )}
            </tbody>
          </TableCard>
        )}
      </div>
    </AppShell>
  )
}

const loanTypes: LoanType[] = ["talangan", "pinjam", "lunas_masuk", "lunas_keluar"]
const loanAccount = (type: LoanType) => t(type === "talangan" || type === "lunas_keluar" ? "ct.paidFrom" : "ct.receivedInto")


function overpayText(type: LoanType, c: Contact) {
  const incoming = type === "lunas_masuk"
  const owed = incoming ? c.receivable : c.payable
  const vars = { name: c.name, amount: fmtIDR(owed) }
  const first = owed > 0 ? t(incoming ? "ct.overOwedIn" : "ct.overOwedOut", vars) : t(incoming ? "ct.overNoneIn" : "ct.overNoneOut", vars)
  return `${first} ${t(incoming ? "ct.overAskIn" : "ct.overAskOut", vars)}`
}

function LoanForm({ contact, accounts, onPosted }: { contact: Contact; accounts: Account[]; onPosted: () => void }) {
  const t = useT()
  const [type, setType] = useState<LoanType>("talangan")
  const [overpay, setOverpay] = useState<{ body: LoanInput; form?: HTMLFormElement } | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)

  const money = accounts.filter((a) => a.is_active && a.type === "Asset" && !perContact(a.code))
  // What is still open for a repayment in this direction.
  const owed = type === "lunas_masuk" ? contact.receivable : type === "lunas_keluar" ? contact.payable : 0
  const expenses = accounts.filter((a) => a.is_active && a.type === "Expense")

  async function send(body: LoanInput, form?: HTMLFormElement) {
    setBusy(true)
    setErr({})
    try {
      const e = await postLoan(body)
      setOverpay(null)
      form?.reset()
      onPosted()
      toast(t("ct.savedToast", { amount: fmtIDR(body.amount), name: contact.name }), {
        action: { label: t("common.undo"), run: () => deleteEntry(e.id).then(() => (toast(t("qa.undone")), onPosted()), (x) => toast(toFormError(x).message ?? "", { tone: "error" })) },
      })
    } catch (e) {
      // A repayment larger than the debt needs an explicit yes: the rest becomes a debt the other way.
      if (e instanceof ApiError && e.code === "overpayment") {
        setOverpay({ body, form })
      } else setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    const el = e.currentTarget as HTMLFormElement
    const v = Object.fromEntries(new FormData(el)) as Record<string, string>
    const amount = toSen(v.amount)
    const myShare = v.my_share ? toSen(v.my_share) : 0
    if (!(amount > 0)) return setErr({ fields: { amount: t("field.positiveAmount") } })
    if (!(myShare >= 0)) return setErr({ fields: { my_share: t("field.invalid") } })
    if (type === "talangan" && myShare > 0 && !v.expense_account_id) return setErr({ fields: { expense_account_id: t("field.choose") } })
    send(
      {
        type,
        contact_id: contact.id,
        account_id: v.account_id,
        amount,
        entry_date: v.entry_date,
        description: v.description,
        ...(type === "talangan" && myShare > 0 ? { my_share: myShare, expense_account_id: v.expense_account_id } : {}),
      },
      el,
    )
  }

  return (
    <Card className="rounded-sm">
      <CardContent className="grid gap-4">
        <Segmented
          label={t("ct.loanType")}
          value={type}
          onChange={(v) => (setType(v), setOverpay(null), setErr({}))}
          items={loanTypes.map((v) => ({ value: v, label: t(`ct.types.${v}.label`) }))}
        />
        <p className="text-sm text-muted-foreground">{t(`ct.types.${type}.help`)}</p>

        {overpay && (
          <div className="grid gap-3 rounded-sm border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{overpayText(type, contact)}</p>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-sm" disabled={busy} onClick={() => send({ ...overpay.body, confirm_overpay: true }, overpay.form)}>
                {t("ct.yesExtra")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOverpay(null)}>{t("common.cancel")}</Button>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Status err={err} ok="" /></div>
          <div className="grid gap-1">
            <AmountField name="amount" label={t("ct.amountRp")} placeholder="100.000" error={err.fields?.amount} />
            {/* Settling up is usually the whole amount: one tap fills it in. */}
            {owed > 0 && (
              <button type="button" className="w-fit text-left text-sm text-primary hover:underline"
                onClick={(e) => {
                  const input = e.currentTarget.closest("form")?.elements.namedItem("amount") as HTMLInputElement | null
                  if (input) (input.value = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(owed / 100), input.focus())
                }}>
                {t("ct.settleAll", { amount: fmtIDR(owed) })}
              </button>
            )}
          </div>
          <DateField name="entry_date" label={t("common.date")} defaultValue={todayISO()} error={err.fields?.entry_date} />
          <SelectField name="account_id" label={loanAccount(type)} options={accountOptions(money)} error={err.fields?.account_id} />
          <Field name="description" label={t("common.note")} placeholder={t("common.optional")} error={err.fields?.description} />
          {type === "talangan" && (
            <>
              <AmountField name="my_share" label={t("ct.myShare")} placeholder="0" error={err.fields?.my_share} />
              <SelectField name="expense_account_id" label={t("ct.myShareOn")} options={accountOptions(expenses)} error={err.fields?.expense_account_id} mustChoose />
            </>
          )}
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy} className="h-10 rounded-sm px-8">
              {busy && <Loader2 className="animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ContactPage({ id }: { id: string }) {
  const t = useT()
  const { route } = useLocation()
  const [detail, setDetail] = useState<ContactDetail | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)
  const [armed, setArmed] = useState(false)
  const [naming, setNaming] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setErr(toFormError(e)))
  }, [])
  useEffect(() => {
    getContact(id).then(setDetail).catch((e) => setErr(toFormError(e)))
  }, [id, reload])

  const c = detail?.contact

  async function rename() {
    const input = document.getElementById("contact-name") as HTMLInputElement
    try {
      await renameContact(id, input.value)
      setReload((n) => n + 1)
      setErr({})
      setNaming(false)
      toast(t("ct.renamed", { name: input.value.trim() }))
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  async function remove() {
    try {
      await deleteContact(id)
      toast(t("ct.deleted", { name: c?.name ?? "" }))
      route("/app/contacts")
    } catch (e) {
      setArmed(false)
      setErr(toFormError(e))
    }
  }

  return (
    <AppShell
      title={c?.name ?? t("ct.contact")}
      back={{ href: "/app/contacts", label: t("ct.all") }}
    >
      <div className="grid gap-6">
        <Status err={err} ok="" />
        {c && (
          <>
            <Card className="rounded-sm bg-gradient-to-b from-[#eaf2ff]/70 to-white">
              <CardContent className="flex flex-wrap items-center gap-6">
                <span className="grid size-11 place-items-center rounded-sm bg-primary/10 text-primary"><HandCoins className="size-5" /></span>
                <div>
                  <p className="text-sm text-muted-foreground">{t("ct.position")}</p>
                  <NetText net={c.net} className="text-xl font-semibold tabular-nums" />
                </div>
                <div className="text-sm tabular-nums text-muted-foreground">
                  <p>{t("ct.owesYou", { amount: fmtIDR(c.receivable) })}</p>
                  <p>{t("ct.youOwe", { amount: fmtIDR(c.payable) })}</p>
                </div>
                <div className="ml-auto flex flex-wrap items-end gap-2">
                  {naming ? (
                    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), rename())}>
                      <Input id="contact-name" aria-label={t("ct.contactName")} defaultValue={c.name} autoFocus className="h-11 w-44 rounded-sm bg-white md:h-9" />
                      <Button type="submit" size="sm" className="h-9 rounded-sm">{t("common.save")}</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setNaming(false)}>{t("common.cancel")}</Button>
                    </form>
                  ) : (
                    <Button variant="outline" size="sm" className="h-9 rounded-sm" onClick={() => setNaming(true)}><Pencil /> {t("ct.editName")}</Button>
                  )}
                  {/* A contact with history stays: past entries keep their name. Only an unused one can go. */}
                  {detail.history.length === 0 && !naming && (armed ? (
                    <>
                      <Button variant="destructive" size="sm" className="h-9" onClick={remove}>{t("common.delete")}</Button>
                      <Button variant="ghost" size="sm" className="h-9" onClick={() => setArmed(false)}>{t("common.cancel")}</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="icon-sm" aria-label={t("ct.deleteContact")} title={t("ct.deleteContact")} onClick={() => setArmed(true)}><Trash2 /></Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {c.net > 0 && (
              <a href={whatsapp(t("ct.waText", { name: c.name, amount: fmtIDR(c.net) }))} target="_blank" rel="noopener noreferrer"
                className="flex w-fit items-center gap-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
                <MessageCircle className="size-4" /> {t("ct.waRemind")}
              </a>
            )}
            <LinkMember contact={c} onChange={() => setReload((n) => n + 1)} />

            <LoanForm contact={c} accounts={accounts} onPosted={() => setReload((n) => n + 1)} />

            <section className="grid gap-2">
              <h2 className="text-lg font-semibold">{t("ct.history")}</h2>
              <MobileList empty={detail.history.length === 0 ? t("ct.nothingYet", { name: c.name }) : undefined}>
                {detail.history.map((l, i) => {
                  const change = l.debit - l.credit
                  return (
                    <MobileItem key={`${l.entry_id}-${i}`} title={l.description} onClick={() => setOpenId(l.entry_id)}
                      meta={<><span>{fmtDate(l.entry_date)}</span><NetText net={l.running_net} /></>}
                      value={`${change > 0 ? "+" : "−"} ${fmtIDR(Math.abs(change))}`}
                      valueClass={change > 0 ? "text-emerald-700" : "text-rose-700"} />
                  )
                })}
              </MobileList>
              <TableCard className="hidden md:block">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("tx.no")}</th>
                    <th>{t("ct.type")}</th>
                    <th>{t("common.note")}</th>
                    <th className="text-right!">{t("ct.change")}</th>
                    <th className="text-right!">{t("ct.positionAfter")}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {detail.history.map((l, i) => {
                    const change = l.debit - l.credit
                    return (
                      <tr key={`${l.entry_id}-${i}`} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenId(l.entry_id)}>
                        <td className="whitespace-nowrap">{fmtDate(l.entry_date)}</td>
                        <td className="text-muted-foreground">{l.entry_no}</td>
                        <td><Badge className={cn("rounded-sm", kindBadge[l.kind] ?? "bg-muted text-foreground")}>{t(`kind.${l.kind}` as Key)}</Badge></td>
                        <td className="max-w-56 truncate">{l.description}</td>
                        <td className={cn("text-right whitespace-nowrap", change > 0 ? "text-emerald-700" : "text-rose-700")}>
                          {change > 0 ? "+" : "−"} {fmtIDR(Math.abs(change))}
                        </td>
                        <td className="text-right whitespace-nowrap"><NetText net={l.running_net} /></td>
                      </tr>
                    )
                  })}
                  {detail.history.length === 0 && (
                    <tr><td colSpan={6} className="py-8! text-center text-muted-foreground">{t("ct.nothingYet", { name: c.name })}</td></tr>
                  )}
                </tbody>
              </TableCard>
              {detail.history.length > 0 && <p className="text-xs text-muted-foreground">{t("ct.keepsHistory")}</p>}
            </section>
          </>
        )}
      </div>
      <EntryDetailSheet id={openId} onClose={() => (setOpenId(null), setReload((n) => n + 1))} />
    </AppShell>
  )
}
