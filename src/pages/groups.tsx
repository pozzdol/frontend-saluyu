import { Check, Loader2, LogOut, Mail, Plus, ShieldCheck, X } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, TableCard } from "@/components/app-shell"
import { Field, Status, accountOptions, toFormError, useForm, type FormError } from "@/components/field"
import { SelectPicker } from "@/components/picker"
import { PeriodPicker, usePeriodDate } from "@/components/period-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  approveLoan,
  cancelInvite,
  createGroup,
  getInbox,
  groupSummary,
  inviteToGroup,
  leaveGroup,
  listAccounts,
  listGroups,
  perContact,
  refreshInbox,
  rejectLoan,
  respondInvite,
  type Account,
  type Group,
  type Inbox,
  type InboxLoan,
  type MemberSummary,
  type Period,
  type User,
} from "@/lib/api"
import { cn, fmtIDR } from "@/lib/utils"

// What a pending loan means for me, in words.
function loanText(l: InboxLoan) {
  const amount = fmtIDR(Math.abs(l.delta))
  if (l.kind === "loan") {
    return l.delta > 0 ? `${l.from_name} paid or lent you ${amount}.` : `${l.from_name} borrowed ${amount} from you.`
  }
  return l.delta < 0 ? `${l.from_name} received ${amount} you paid back.` : `${l.from_name} paid you back ${amount}.`
}

function LoanRequest({ loan, accounts, onDone }: { loan: InboxLoan; accounts: Account[]; onDone: () => void }) {
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
        <Badge className="rounded-sm bg-orange-50 text-orange-700 capitalize">{loan.kind}</Badge>
        <span className="font-medium">{loanText(loan)}</span>
        <span className="text-muted-foreground">{loan.entry_date}</span>
      </div>
      <Status err={err} ok="" />
      <div className="grid gap-2 md:flex md:flex-wrap md:items-end">
        <div className="grid gap-1 text-sm md:w-72">
          <span className="text-muted-foreground">Record my side in</span>
          <SelectPicker aria-label="Record my side in" title="Record my side in" value={accountId} onChange={setAccountId} options={accountOptions(options)} className="md:h-9" />
        </div>
        <Button size="sm" className="h-9 rounded-sm" disabled={busy} onClick={() => act(true)}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
        <Button size="sm" variant="ghost" className="h-9" disabled={busy} onClick={() => act(false)}>
          <X /> Reject
        </Button>
      </div>
    </li>
  )
}

function SummaryTable({ group, date, onPeriod }: { group: Group; date: string; onPeriod: (p: Period) => void }) {
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
              <p className="text-xs text-muted-foreground">{s.period.label}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums">
                {[
                  ["Income", fmtIDR(s.income)],
                  ["Expense", fmtIDR(s.expense)],
                  ["Surplus", fmtIDR(s.surplus)],
                  ["Saved", `${(s.savings_rate * 100).toFixed(0)}%`],
                  ["Budget used", s.budget > 0 ? `${Math.round((s.budget_actual / s.budget) * 100)}%` : "—"],
                  ["Assets", fmtIDR(s.assets)],
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
              <th>Member</th>
              <th className="text-right!">Income</th>
              <th className="text-right!">Expense</th>
              <th className="text-right!">Surplus</th>
              <th className="text-right!">Saved</th>
              <th className="text-right!">Budget used</th>
              <th className="text-right!">Assets</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((s) => (
              <tr key={s.member.id}>
                <td>
                  <span className="font-medium">{s.member.name}</span>
                  <span className="block text-xs text-muted-foreground">{s.period.label}</span>
                </td>
                <td className="text-right">{fmtIDR(s.income)}</td>
                <td className="text-right">{fmtIDR(s.expense)}</td>
                <td className={cn("text-right", s.surplus < 0 && "text-rose-700")}>{fmtIDR(s.surplus)}</td>
                <td className="text-right">{(s.savings_rate * 100).toFixed(0)}%</td>
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

function GroupCard({ group, me, date, onChange }: { group: Group; me: User; date: string; onChange: () => void }) {
  const [period, setPeriod] = useState<Period | null>(null)
  const [, setDate] = usePeriodDate()
  const [leaving, setLeaving] = useState(false)
  const [err, setErr] = useState<FormError>({})
  const invite = useForm(async (v, el) => {
    const inv = await inviteToGroup(group.id, v.email)
    el.reset()
    onChange()
    return `Invite saved for ${inv.email}. They will see it after signing in with that email.`
  })

  async function run(fn: () => Promise<unknown>) {
    setErr({})
    try {
      await fn()
      onChange()
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  return (
    <Card className="rounded-sm">
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold">{group.name}</h2>
          {leaving ? (
            <span className="flex gap-1">
              <Button size="sm" variant="destructive" onClick={() => run(() => leaveGroup(group.id))}>Leave group</Button>
              <Button size="sm" variant="ghost" onClick={() => setLeaving(false)}>Cancel</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setLeaving(true)}><LogOut /> Leave</Button>
          )}
        </div>
        <Status err={err} ok="" />

        <div className="flex flex-wrap gap-2">
          {group.members.map((m) => (
            <Badge key={m.id} className="rounded-sm bg-[#eaf2ff] px-2.5 py-1 text-primary">
              {m.name}{m.id === me.id && " (you)"}
            </Badge>
          ))}
          {group.pending_invites.map((i) => (
            <Badge key={i.id} className="gap-1 rounded-sm bg-muted px-2.5 py-1 text-muted-foreground">
              <Mail className="size-3" /> {i.email} · pending
              <button type="button" aria-label={`Cancel invite for ${i.email}`} className="ml-1 hover:text-foreground"
                onClick={() => run(() => cancelInvite(group.id, i.id))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>

        <form onSubmit={invite.onSubmit} noValidate className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="sm:col-span-2"><Status err={invite.err} ok={invite.ok} /></div>
          <Field name="email" label="Invite by email" type="email" placeholder="partner@example.com" error={invite.err.fields?.email} />
          <Button type="submit" variant="outline" disabled={invite.busy} className="h-10 rounded-sm">
            {invite.busy ? <Loader2 className="animate-spin" /> : <Plus />} Invite
          </Button>
        </form>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">Summary</h3>
            <PeriodPicker period={period ?? undefined} onChange={setDate} />
          </div>
          <SummaryTable group={group} date={date} onPeriod={setPeriod} />
        </div>
      </CardContent>
    </Card>
  )
}

export function GroupsPage({ user }: { user: User }) {
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
    return `Group "${g.name}" created. Invite people by email below.`
  })

  async function answer(inviteId: string, accept: boolean) {
    try {
      await respondInvite(inviteId, accept)
      changed()
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  const waiting = (inbox?.invites.length ?? 0) + (inbox?.loans.length ?? 0)

  return (
    <AppShell title="Groups">
      <div className="grid gap-6">
        <p className="flex max-w-3xl gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Members see each other's period totals only: income, spending, savings and budget use. Individual transactions
          and notes never leave your book. Loans with a linked contact appear in their inbox to approve.
        </p>

        <Status err={err} ok="" />

        {waiting > 0 && inbox && (
          <section aria-labelledby="inbox-title" className="grid gap-3">
            <h2 id="inbox-title" className="text-lg font-semibold">Waiting for you</h2>
            <ul className="grid gap-3">
              {inbox.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-sm border bg-white p-4 text-sm">
                  <Mail className="size-4 text-primary" />
                  <span className="mr-auto"><span className="font-medium">{i.invited_by_name}</span> invited you to <span className="font-medium">{i.group_name}</span>.</span>
                  <Button size="sm" className="rounded-sm" onClick={() => answer(i.id, true)}><Check /> Join</Button>
                  <Button size="sm" variant="ghost" onClick={() => answer(i.id, false)}>Decline</Button>
                </li>
              ))}
              {inbox.loans.map((l) => <LoanRequest key={l.id} loan={l} accounts={accounts} onDone={changed} />)}
            </ul>
          </section>
        )}

        <Card className="rounded-sm">
          <CardContent>
            <form onSubmit={create.onSubmit} noValidate className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="sm:col-span-2"><Status err={create.err} ok={create.ok} /></div>
              <Field name="name" label="New group" placeholder="Rumah" error={create.err.fields?.name} />
              <Button type="submit" disabled={create.busy} className="h-10 rounded-sm">
                {create.busy ? <Loader2 className="animate-spin" /> : <Plus />} Create group
              </Button>
            </form>
          </CardContent>
        </Card>

        {groups?.map((g) => <GroupCard key={g.id} group={g} me={user} date={date} onChange={changed} />)}
        {groups && groups.length === 0 && (
          <p className="text-sm text-muted-foreground">You are not in any group yet. Create one and invite your partner or family.</p>
        )}
      </div>
    </AppShell>
  )
}
