import { Check, Copy, Link2, Loader2, LogOut, Mail, MessageCircle, Pencil, Plus, ShieldCheck, X } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Field, Status, accountOptions, toFormError, useForm, type FormError } from "@/components/field"
import { SelectPicker } from "@/components/picker"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  approveChange,
  createInviteLink,
  whatsapp,
  approveLoan,
  cancelInvite,
  createGroup,
  getInbox,
  groupSummary,
  inviteToGroup,
  leaveGroup,
  renameGroup,
  listAccounts,
  listGroups,
  perContact,
  refreshInbox,
  rejectChange,
  rejectLoan,
  respondInvite,
  type Account,
  type Group,
  type Inbox,
  type InboxChange,
  type InboxLoan,
  type MemberSummary,
  type Period,
  type User,
} from "@/lib/api"
import { cn, fmtIDR, fmtPercent } from "@/lib/utils"
import { fmtDate, fmtPeriod } from "@/components/picker"
import { t, useT, type Key } from "@/lib/i18n"
import { toast } from "@/components/toast"
import { Input } from "@/components/ui/input"

// What a pending loan means for me, in words.
function loanText(l: InboxLoan) {
  const amount = fmtIDR(Math.abs(l.delta))
  if (l.kind === "loan") {
    return t(l.delta > 0 ? "grp.lentYou" : "grp.borrowed", { name: l.from_name, amount })
  }
  return t(l.delta < 0 ? "grp.gotBack" : "grp.paidBack", { name: l.from_name, amount })
}

function LoanRequest({ loan, accounts, onDone }: { loan: InboxLoan; accounts: Account[]; onDone: () => void }) {
  const t = useT()
  // My side of the entry: the bank the money moved through, or the expense it paid for.
  const options = accounts.filter((a) => a.is_active && !perContact(a.code) && ["Asset", "Expense", "Revenue"].includes(a.type))
  const [accountId, setAccountId] = useState(options.find((a) => a.code === "1001")?.id ?? options[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})

  async function act(approve: boolean) {
    setBusy(true)
    setErr({})
    try {
      if (approve) await approveLoan(loan.id, accountId)
      else await rejectLoan(loan.id)
      onDone()
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="grid gap-3 rounded-sm border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className="rounded-sm bg-orange-50 text-orange-700">{t(`kind.${loan.kind}` as Key)}</Badge>
        <span className="font-medium">{loanText(loan)}</span>
        <span className="text-muted-foreground">{fmtDate(loan.entry_date)}</span>
      </div>
      <Status err={err} ok="" />
      <div className="grid gap-2 md:flex md:flex-wrap md:items-end">
        <div className="grid gap-1 text-sm md:w-72">
          <span className="text-muted-foreground">{t("grp.mySide")}</span>
          <SelectPicker aria-label={t("grp.mySide")} title={t("grp.mySide")} value={accountId} onChange={setAccountId} options={accountOptions(options)} className="md:h-9" />
        </div>
        <Button size="sm" className="h-9 rounded-sm" disabled={busy} onClick={() => act(true)}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} {t("grp.approve")}
        </Button>
        <Button size="sm" variant="ghost" className="h-9" disabled={busy} onClick={() => act(false)}>
          <X /> {t("grp.reject")}
        </Button>
      </div>
    </li>
  )
}

function ChangeRequest({ change, onDone }: { change: InboxChange; onDone: () => void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})
  async function act(approve: boolean) {
    setBusy(true)
    setErr({})
    try {
      await (approve ? approveChange : rejectChange)(change.id)
      onDone()
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }
  const side = (label: string, v: InboxChange["before"]) => (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{fmtIDR(Math.abs(v.amount))} · {fmtDate(v.entry_date)}</dd>
    </div>
  )
  return (
    <li className="grid gap-3 rounded-sm border bg-white p-4 text-sm">
      <p className="font-medium">{t("grp.changed", { name: change.from_name })}</p>
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {side(t("grp.before"), change.before)}
        <span aria-hidden="true" className="text-muted-foreground">→</span>
        {side(t("grp.after"), change.after)}
      </dl>
      <Status err={err} ok="" />
      <div className="flex gap-2">
        <Button size="sm" className="h-9 rounded-sm" disabled={busy} onClick={() => act(true)}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} {t("grp.approve")}
        </Button>
        <Button size="sm" variant="ghost" className="h-9" disabled={busy} onClick={() => act(false)}>
          <X /> {t("grp.reject")}
        </Button>
      </div>
    </li>
  )
}

function SummaryTable({ group, date, onPeriod }: { group: Group; date: string; onPeriod: (p: Period) => void }) {
  const t = useT()
  const [rows, setRows] = useState<MemberSummary[] | null>(null)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    groupSummary(group.id, date)
      .then((r) => {
        setRows(r)
        if (r[0]) onPeriod(r[0].period)
      })
      .catch((e) => setErr(toFormError(e)))
  }, [group.id, date])

  return (
    <>
      <Status err={err} ok="" />
      {rows && (
        <ul className="grid gap-3 md:hidden">
          {rows.map((s) => (
            <li key={s.member.id} className="rounded-sm border bg-card p-4">
              <p className="font-medium">{s.member.name}</p>
              <p className="text-xs text-muted-foreground">{fmtPeriod(s.period)}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums">
                {[
                  [t("grp.income"), fmtIDR(s.income)],
                  [t("grp.expense"), fmtIDR(s.expense)],
                  [t("grp.surplus"), fmtIDR(s.surplus)],
                  [t("grp.saved"), fmtPercent(s.savings_rate, 0)],
                  [t("grp.budgetUsed"), s.budget > 0 ? `${Math.round((s.budget_actual / s.budget) * 100)}%` : "—"],
                  [t("grp.assets"), fmtIDR(s.assets)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
      {rows && (
        <TableCard className="hidden md:block">
          <thead>
            <tr>
              <th>{t("grp.member")}</th>
              <th className="text-right!">{t("grp.income")}</th>
              <th className="text-right!">{t("grp.expense")}</th>
              <th className="text-right!">{t("grp.surplus")}</th>
              <th className="text-right!">{t("grp.saved")}</th>
              <th className="text-right!">{t("grp.budgetUsed")}</th>
              <th className="text-right!">{t("grp.assets")}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((s) => (
              <tr key={s.member.id}>
                <td>
                  <span className="font-medium">{s.member.name}</span>
                  <span className="block text-xs text-muted-foreground">{fmtPeriod(s.period)}</span>
                </td>
                <td className="text-right">{fmtIDR(s.income)}</td>
                <td className="text-right">{fmtIDR(s.expense)}</td>
                <td className={cn("text-right", s.surplus < 0 && "text-rose-700")}>{fmtIDR(s.surplus)}</td>
                <td className="text-right">{fmtPercent(s.savings_rate, 0)}</td>
                <td className="text-right">
                  {s.budget > 0 ? (
                    <span className={cn(s.budget_actual > s.budget && "text-rose-700")}>
                      {Math.round((s.budget_actual / s.budget) * 100)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="text-right">{fmtIDR(s.assets)}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </>
  )
}

// InviteByLink makes a one-time join link to share by WhatsApp or copy.
function InviteByLink({ group }: { group: Group }) {
  const t = useT()
  const [url, setUrl] = useState("")
  const [err, setErr] = useState<FormError>({})
  async function make() {
    setErr({})
    try {
      const link = await createInviteLink(group.id)
      setUrl(`${location.origin}/join?token=${link.token}`)
    } catch (e) {
      setErr(toFormError(e))
    }
  }
  if (!url)
    return (
      <>
        <Button size="sm" variant="outline" className="rounded-sm" onClick={make}><Link2 /> {t("grp.inviteLink")}</Button>
        <Status err={err} ok="" />
      </>
    )
  return (
    <span className="flex w-full flex-wrap items-center gap-2 rounded-sm bg-[#f4f8ff] p-2 text-sm md:w-auto">
      <a href={whatsapp(t("grp.waText", { group: group.name, url }))} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-sm bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700">
        <MessageCircle className="size-4" /> WhatsApp
      </a>
      <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(url).then(() => toast(t("grp.linkCopied")), () => {})}>
        <Copy /> {t("sec.copy")}
      </Button>
      <span className="text-xs text-muted-foreground">{t("grp.linkHint")}</span>
    </span>
  )
}

function GroupCard({ group, me, date, onChange }: { group: Group; me: User; date: string; onChange: () => void }) {
  const t = useT()
  const [period, setPeriod] = useState<Period | null>(null)
  const [, setDate] = usePeriodDate()
  const [leaving, setLeaving] = useState(false)
  const [naming, setNaming] = useState(false)
  const [err, setErr] = useState<FormError>({})
  const invite = useForm(async (v, el) => {
    const inv = await inviteToGroup(group.id, v.email)
    el.reset()
    onChange()
    return t("grp.inviteSaved", { email: inv.email })
  })

  async function run(fn: () => Promise<unknown>) {
    setErr({})
    try {
      await fn()
      onChange()
      return true
    } catch (e) {
      setErr(toFormError(e))
      return false
    }
  }

  return (
    <Card className="rounded-sm">
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          {naming ? (
            <form className="mr-auto flex flex-wrap items-center gap-2" onSubmit={(e) => {
              e.preventDefault()
              const name = ((e.currentTarget as HTMLFormElement).elements.namedItem("name") as HTMLInputElement).value
              run(() => renameGroup(group.id, name)).then((ok) => ok && (setNaming(false), toast(t("grp.renamed", { name: name.trim() }))))
            }}>
              <Input name="name" defaultValue={group.name} autoFocus aria-label={t("grp.groupName")} className="h-9 w-48 rounded-sm" />
              <Button type="submit" size="sm" className="rounded-sm">{t("common.save")}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNaming(false)}>{t("common.cancel")}</Button>
            </form>
          ) : (
            <h2 className="mr-auto flex items-center gap-1 text-lg font-semibold">
              {group.name}
              <Button variant="ghost" size="icon-sm" aria-label={t("grp.rename")} title={t("grp.rename")} onClick={() => setNaming(true)}><Pencil /></Button>
            </h2>
          )}
          <InviteByLink group={group} />
          {leaving ? (
            <span className="flex gap-1">
              <Button size="sm" variant="destructive" onClick={() => run(() => leaveGroup(group.id)).then((ok) => ok && toast(t("grp.left", { name: group.name })))}>{t("grp.leaveGroup")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setLeaving(false)}>{t("common.cancel")}</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}><LogOut /> {t("grp.leave")}</Button>
          )}
        </div>
        <Status err={err} ok="" />

        <div className="flex flex-wrap gap-2">
          {group.members.map((m) => (
            <Badge key={m.id} className="rounded-sm bg-[#eaf2ff] px-2.5 py-1 text-primary">
              {m.name}{m.id === me.id && t("grp.you")}
            </Badge>
          ))}
          {group.pending_invites.map((i) => (
            <Badge key={i.id} className="gap-1 rounded-sm bg-muted px-2.5 py-1 text-muted-foreground">
              <Mail className="size-3" /> {i.email} · {t("grp.pending")}
              <button type="button" aria-label={t("grp.cancelInvite", { email: i.email })} className="ml-1 hover:text-foreground"
                onClick={() => run(() => cancelInvite(group.id, i.id))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>

        <form onSubmit={invite.onSubmit} noValidate className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="sm:col-span-2"><Status err={invite.err} ok={invite.ok} /></div>
          <Field name="email" label={t("grp.inviteByEmail")} type="email" placeholder="partner@example.com" error={invite.err.fields?.email} />
          <Button type="submit" variant="outline" disabled={invite.busy} className="h-10 rounded-sm">
            {invite.busy ? <Loader2 className="animate-spin" /> : <Plus />} {t("grp.invite")}
          </Button>
        </form>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{t("grp.summary")}</h3>
            <PeriodPicker period={period ?? undefined} onChange={setDate} />
          </div>
          <SummaryTable group={group} date={date} onPeriod={setPeriod} />
        </div>
      </CardContent>
    </Card>
  )
}

export function GroupsPage({ user }: { user: User }) {
  const t = useT()
  const [date] = usePeriodDate()
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)

  useEffect(() => {
    listAccounts().then(setAccounts).catch(() => {})
  }, [])
  useEffect(() => {
    Promise.all([listGroups(), getInbox()])
      .then(([g, i]) => (setGroups(g), setInbox(i), refreshInbox()))
      .catch((e) => setErr(toFormError(e)))
  }, [reload])
  const changed = () => setReload((n) => n + 1)

  const create = useForm(async (v, el) => {
    const g = await createGroup(v.name)
    el.reset()
    changed()
    toast(t("grp.created", { name: g.name }))
    return ""
  })

  async function answer(inviteId: string, accept: boolean) {
    try {
      await respondInvite(inviteId, accept)
      changed()
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  const waiting = (inbox?.invites.length ?? 0) + (inbox?.loans.length ?? 0) + (inbox?.changes?.length ?? 0)

  return (
    <AppShell title={t("grp.title")}>
      <div className="grid gap-6">
        <p className="flex max-w-3xl gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          {t("grp.privacy")}
        </p>

        <Status err={err} ok="" />
        {!user.email_verified && <p className="text-sm text-amber-800">{t("verify.groupsHint")}</p>}

        {waiting > 0 && inbox && (
          <section aria-labelledby="inbox-title" className="grid gap-3">
            <h2 id="inbox-title" className="text-lg font-semibold">{t("grp.waiting")}</h2>
            <ul className="grid gap-3">
              {inbox.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-sm border bg-white p-4 text-sm">
                  <Mail className="size-4 text-primary" />
                  <span className="mr-auto">{t("grp.invitedYou", { name: i.invited_by_name, group: i.group_name })}</span>
                  <Button size="sm" className="rounded-sm" onClick={() => answer(i.id, true)}><Check /> {t("grp.join")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => answer(i.id, false)}>{t("grp.decline")}</Button>
                </li>
              ))}
              {inbox.loans.map((l) => <LoanRequest key={l.id} loan={l} accounts={accounts} onDone={changed} />)}
              {inbox.changes?.map((c) => <ChangeRequest key={c.id} change={c} onDone={changed} />)}
            </ul>
          </section>
        )}

        <Card className="rounded-sm">
          <CardContent>
            <form onSubmit={create.onSubmit} noValidate className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="sm:col-span-2"><Status err={create.err} ok={create.ok} /></div>
              <Field name="name" label={t("grp.newGroup")} placeholder="Rumah" error={create.err.fields?.name} />
              <Button type="submit" disabled={create.busy} className="h-10 rounded-sm">
                {create.busy ? <Loader2 className="animate-spin" /> : <Plus />} {t("grp.create")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {groups?.map((g) => <GroupCard key={g.id} group={g} me={user} date={date} onChange={changed} />)}
        {groups && groups.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("grp.none")}</p>
        )}
      </div>
    </AppShell>
  )
}
