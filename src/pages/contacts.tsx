import { ArrowLeft, HandCoins, Loader2, Plus, Trash2 } from "lucide-react"
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
  getContact,
  linkContact,
  listAccounts,
  listGroups,
  useAuth,
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

// LinkMember ties a contact to a member of one of my groups: their book then mirrors our loans.
function LinkMember({ contact, onChange }: { contact: Contact; onChange: () => void }) {
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
        <span className="font-medium" id="linked-label">Linked group member</span>
        <SelectPicker
          aria-label="Linked group member"
          title="Linked group member"
          value={contact.linked_user_id ?? ""}
          onChange={change}
          options={[{ value: "", label: "Not linked" }, ...members.map((m) => ({ value: m.id, label: m.name, hint: m.email }))]}
        />
        <span className="text-xs text-muted-foreground">
          When linked, loans you record with {contact.name} wait in their inbox, and approving them records the same loan in their book.
        </span>
      </div>
      <Status err={err} ok="" />
    </div>
  )
}

// NetText says who owes whom in words, so the sign is never the only signal.
function NetText({ net, className }: { net: number; className?: string }) {
  if (net === 0) return <span className={cn("text-muted-foreground", className)}>Settled</span>
  return (
    <span className={cn(net > 0 ? "text-emerald-700" : "text-rose-700", className)}>
      {net > 0 ? `Owes you ${fmtIDR(net)}` : `You owe ${fmtIDR(-net)}`}
    </span>
  )
}

export function ContactsPage() {
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
    return `${c.name} added.`
  })

  const owedToMe = contacts?.reduce((s, c) => s + c.receivable, 0) ?? 0
  const iOwe = contacts?.reduce((s, c) => s + c.payable, 0) ?? 0

  return (
    <AppShell title="Contacts">
      <div className="grid gap-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          People you lend to, pay for, or borrow from. Money you advance becomes a receivable on their name instead of an
          expense, so your spending reports stay honest and you always know who still owes what.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-sm"><CardContent>
            <p className="text-sm text-muted-foreground">Others owe you</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700 tabular-nums">{fmtIDR(owedToMe)}</p>
          </CardContent></Card>
          <Card className="rounded-sm"><CardContent>
            <p className="text-sm text-muted-foreground">You owe others</p>
            <p className="mt-1 text-xl font-semibold text-rose-700 tabular-nums">{fmtIDR(iOwe)}</p>
          </CardContent></Card>
        </div>

        <Card className="rounded-sm">
          <CardContent>
            <form onSubmit={form.onSubmit} noValidate className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="sm:col-span-2"><Status err={form.err} ok={form.ok} /></div>
              <Field name="name" label="New contact" placeholder="Bau" error={form.err.fields?.name} />
              <Button type="submit" disabled={form.busy} className="h-10 rounded-sm">
                {form.busy ? <Loader2 className="animate-spin" /> : <Plus />}
                Add contact
              </Button>
            </form>
          </CardContent>
        </Card>

        <Status err={err} ok="" />
        {contacts && (
          <MobileList empty={contacts.length === 0 ? "No contacts yet. Add the people you share money with." : undefined}>
            {contacts.map((c) => (
              <MobileItem key={c.id} href={`/app/contacts/${c.id}`} title={c.name}
                meta={c.receivable && c.payable ? <span>Owes you {fmtIDR(c.receivable)} · you owe {fmtIDR(c.payable)}</span> : undefined}
                value={<NetText net={c.net} className="text-sm" />} />
            ))}
          </MobileList>
        )}
        {contacts && (
          <TableCard className="hidden md:block">
            <thead>
              <tr>
                <th>Name</th>
                <th className="text-right!">Owes you</th>
                <th className="text-right!">You owe</th>
                <th className="text-right!">Position</th>
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
                <tr><td colSpan={4} className="py-10! text-center text-muted-foreground">No contacts yet. Add the people you share money with.</td></tr>
              )}
            </tbody>
          </TableCard>
        )}
      </div>
    </AppShell>
  )
}

const loanTypes: Record<LoanType, { label: string; help: string; account: string }> = {
  talangan: { label: "I paid / lent", help: "You paid for them or lent them money. Split a bill by entering your own share.", account: "Paid from" },
  pinjam: { label: "I borrowed", help: "They lent you money or paid for you.", account: "Received into" },
  lunas_masuk: { label: "They paid me back", help: "Money they return to you.", account: "Received into" },
  lunas_keluar: { label: "I paid them back", help: "Money you return to them.", account: "Paid from" },
}


function overpayText(type: LoanType, c: Contact) {
  const incoming = type === "lunas_masuk"
  const owed = incoming ? c.receivable : c.payable
  const debt = incoming ? `${c.name} owes you` : `you owe ${c.name}`
  const first = owed > 0 ? `This is more than the ${fmtIDR(owed)} ${debt}.` : `Right now ${debt} nothing.`
  return `${first} Record the extra as money ${incoming ? `you now owe ${c.name}` : `${c.name} now owes you`}?`
}

function LoanForm({ contact, accounts, onPosted }: { contact: Contact; accounts: Account[]; onPosted: () => void }) {
  const [type, setType] = useState<LoanType>("talangan")
  const [overpay, setOverpay] = useState<{ body: LoanInput; form?: HTMLFormElement } | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [ok, setOk] = useState("")
  const [busy, setBusy] = useState(false)

  const money = accounts.filter((a) => a.is_active && a.type === "Asset" && !perContact(a.code))
  const expenses = accounts.filter((a) => a.is_active && a.type === "Expense")

  async function send(body: LoanInput, form?: HTMLFormElement) {
    setBusy(true)
    setErr({})
    setOk("")
    try {
      const e = await postLoan(body)
      setOverpay(null)
      form?.reset()
      setOk(`Saved as entry #${e.entry_no}.`)
      onPosted()
    } catch (e) {
      // A repayment larger than the debt needs an explicit yes: the rest becomes a debt the other way.
      if (e instanceof ApiError && e.status === 409 && e.message.includes("outstanding")) {
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
    if (!(amount > 0)) return setErr({ fields: { amount: "must be a positive amount" } })
    if (!(myShare >= 0)) return setErr({ fields: { my_share: "is invalid" } })
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
          label="Loan type"
          value={type}
          onChange={(t) => (setType(t), setOverpay(null), setErr({}), setOk(""))}
          items={(Object.keys(loanTypes) as LoanType[]).map((t) => ({ value: t, label: loanTypes[t].label }))}
        />
        <p className="text-sm text-muted-foreground">{loanTypes[type].help}</p>

        {overpay && (
          <div className="grid gap-3 rounded-sm border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>{overpayText(type, contact)}</p>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-sm" disabled={busy} onClick={() => send({ ...overpay.body, confirm_overpay: true }, overpay.form)}>
                Yes, record the extra
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOverpay(null)}>Cancel</Button>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Status err={err} ok={ok} /></div>
          <AmountField name="amount" label="Amount (Rp)" placeholder="100.000" error={err.fields?.amount} />
          <DateField name="entry_date" label="Date" defaultValue={todayISO()} error={err.fields?.entry_date} />
          <SelectField name="account_id" label={loanTypes[type].account} options={accountOptions(money)} error={err.fields?.account_id} />
          <Field name="description" label="Note" placeholder="Optional" error={err.fields?.description} />
          {type === "talangan" && (
            <>
              <AmountField name="my_share" label="My share (Rp), for split bills" placeholder="0" error={err.fields?.my_share} />
              <SelectField name="expense_account_id" label="My share is spent on" options={accountOptions(expenses)} error={err.fields?.expense_account_id} />
            </>
          )}
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy} className="h-10 rounded-sm px-8">
              {busy && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ContactPage({ id }: { id: string }) {
  const { route } = useLocation()
  const [detail, setDetail] = useState<ContactDetail | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)
  const [armed, setArmed] = useState(false)

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
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  async function remove() {
    try {
      await deleteContact(id)
      route("/app/contacts")
    } catch (e) {
      setArmed(false)
      setErr(toFormError(e))
    }
  }

  return (
    <AppShell
      title={c?.name ?? "Contact"}
      actions={
        <a href="/app/contacts" className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> All contacts
        </a>
      }
    >
      <div className="grid gap-6">
        <Status err={err} ok="" />
        {c && (
          <>
            <Card className="rounded-sm bg-gradient-to-b from-[#eaf2ff]/70 to-white">
              <CardContent className="flex flex-wrap items-center gap-6">
                <span className="grid size-11 place-items-center rounded-sm bg-primary/10 text-primary"><HandCoins className="size-5" /></span>
                <div>
                  <p className="text-sm text-muted-foreground">Position</p>
                  <NetText net={c.net} className="text-xl font-semibold tabular-nums" />
                </div>
                <div className="text-sm tabular-nums text-muted-foreground">
                  <p>Owes you {fmtIDR(c.receivable)}</p>
                  <p>You owe {fmtIDR(c.payable)}</p>
                </div>
                <div className="ml-auto flex flex-wrap items-end gap-2">
                  <Input id="contact-name" aria-label="Contact name" defaultValue={c.name} className="h-11 w-40 rounded-sm bg-white md:h-9" />
                  <Button variant="outline" size="sm" className="h-9 rounded-sm" onClick={rename}>Rename</Button>
                  {armed ? (
                    <>
                      <Button variant="destructive" size="sm" className="h-9" onClick={remove}>Delete</Button>
                      <Button variant="ghost" size="sm" className="h-9" onClick={() => setArmed(false)}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="icon-sm" aria-label="Delete contact" onClick={() => setArmed(true)}><Trash2 /></Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <LinkMember contact={c} onChange={() => setReload((n) => n + 1)} />

            <LoanForm contact={c} accounts={accounts} onPosted={() => setReload((n) => n + 1)} />

            <section className="grid gap-2">
              <h2 className="text-lg font-semibold">History</h2>
              <MobileList empty={detail.history.length === 0 ? `Nothing recorded with ${c.name} yet.` : undefined}>
                {detail.history.map((l, i) => {
                  const change = l.debit - l.credit
                  return (
                    <MobileItem key={`${l.entry_id}-${i}`} title={l.description}
                      meta={<><span>{fmtDate(l.entry_date)}</span><NetText net={l.running_net} /></>}
                      value={`${change > 0 ? "+" : "−"} ${fmtIDR(Math.abs(change))}`}
                      valueClass={change > 0 ? "text-emerald-700" : "text-rose-700"} />
                  )
                })}
              </MobileList>
              <TableCard className="hidden md:block">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>No</th>
                    <th>Type</th>
                    <th>Note</th>
                    <th className="text-right!">Change</th>
                    <th className="text-right!">Position after</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {detail.history.map((l, i) => {
                    const change = l.debit - l.credit
                    return (
                      <tr key={`${l.entry_id}-${i}`}>
                        <td className="whitespace-nowrap">{fmtDate(l.entry_date)}</td>
                        <td className="text-muted-foreground">{l.entry_no}</td>
                        <td><Badge className={cn("rounded-sm capitalize", kindBadge[l.kind] ?? "bg-muted text-foreground")}>{l.kind.replace("_", " ")}</Badge></td>
                        <td className="max-w-56 truncate">{l.description}</td>
                        <td className={cn("text-right whitespace-nowrap", change > 0 ? "text-emerald-700" : "text-rose-700")}>
                          {change > 0 ? "+" : "−"} {fmtIDR(Math.abs(change))}
                        </td>
                        <td className="text-right whitespace-nowrap"><NetText net={l.running_net} /></td>
                      </tr>
                    )
                  })}
                  {detail.history.length === 0 && (
                    <tr><td colSpan={6} className="py-8! text-center text-muted-foreground">Nothing recorded with {c.name} yet.</td></tr>
                  )}
                </tbody>
              </TableCard>
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}
