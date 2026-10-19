import { Archive, CreditCard, Landmark, Loader2, Plus, Trash2 } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList, TableCard } from "@/components/app-shell"
import { AmountField, DateField, Field, SelectField, Status, accountOptions, toFormError, useForm, type FormError } from "@/components/field"
import { DayOfMonthPicker, fmtDate, useIsMobile } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import { Info, Term } from "@/components/term"
import { toast } from "@/components/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  ApiError,
  createCard,
  createPlan,
  deletePlan,
  getCard,
  getPlan,
  isFixedAsset,
  listAccounts,
  listCards,
  listPlans,
  payInstallment,
  perContact,
  postEntry,
  updateAccount,
  updateCard,
  useEntriesVersion,
  type Account,
  type CardLine,
  type CardSummary,
  type Plan,
  type Statement,
} from "@/lib/api"
import { useT, type Key } from "@/lib/i18n"
import { cn, fmtIDR, toSen, todayISO } from "@/lib/utils"

const statusTone: Record<Statement["status"], string> = {
  paid: "bg-emerald-50 text-emerald-700",
  due: "bg-sky-50 text-sky-700",
  min_paid: "bg-amber-50 text-amber-800",
  overdue: "bg-rose-50 text-rose-700",
}

function StatusBadge({ s }: { s: Statement }) {
  const t = useT()
  return <Badge className={cn("rounded-sm", statusTone[s.status])}>{t(`cc.status.${s.status}` as Key)}</Badge>
}

const moneyAccounts = (list: Account[]) => list.filter((a) => a.is_active && a.type === "Asset" && !perContact(a.code))
const daysUntil = (iso: string) => Math.round((Date.parse(iso) - Date.parse(todayISO())) / 864e5)

// Dashboard tile: bills due within a week, or late.
export function DueBills() {
  const t = useT()
  const [cards, setCards] = useState<CardSummary[]>([])
  const version = useEntriesVersion()
  useEffect(() => {
    listCards().then(setCards, () => {})
  }, [version])
  const due = cards.filter((c) => c.last.remaining > 0 && (c.last.status === "overdue" || daysUntil(c.last.due_date) <= 7))
  if (due.length === 0) return null
  return (
    <Card className="rounded-sm border-amber-200 bg-amber-50/60">
      <CardContent className="grid gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="size-4" /> {t("cc.dueSoon")}</h2>
        <ul className="grid gap-1 text-sm">
          {due.map((c) => (
            <li key={c.account.id}>
              <a href={`/app/cards/${c.account.id}`} className="flex flex-wrap items-center justify-between gap-2 hover:underline">
                <span>{c.account.name} · {t("cc.dueOn", { date: fmtDate(c.last.due_date) })}</span>
                <span className="flex items-center gap-2 font-medium tabular-nums">{fmtIDR(c.last.remaining)} <StatusBadge s={c.last} /></span>
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function NewCard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const t = useT()
  const [kind, setKind] = useState<"credit_card" | "paylater">("credit_card")
  const [stmt, setStmt] = useState(20)
  const [due, setDue] = useState(5)
  const form = useForm(async (v, el) => {
    const limit = v.credit_limit ? toSen(v.credit_limit) : 0
    const pct = v.min_payment_pct ? Number(v.min_payment_pct) : 10
    if (!(limit >= 0)) throw new ApiError(400, "validation failed", undefined, "validation", { credit_limit: "invalid" })
    if (!(pct >= 0 && pct <= 100)) throw new ApiError(400, "validation failed", undefined, "validation", { min_payment_pct: "max:100" })
    const c = await createCard({ name: v.name, kind, statement_day: stmt, due_day: due, credit_limit: limit, min_payment_pct: pct })
    el.reset()
    onDone()
    toast(t("cc.cardAdded", { name: c.account.name }))
    return ""
  })
  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><Status err={form.err} ok={form.ok} /></div>
      <Segmented label={t("cc.kind")} value={kind} onChange={setKind} className="md:col-span-2"
        items={[{ value: "credit_card", label: t("cc.creditCard") }, { value: "paylater", label: t("cc.paylater") }]} />
      <Field name="name" label={t("cc.name")} placeholder={kind === "credit_card" ? "BCA Visa" : "Shopee PayLater"} error={form.err.fields?.name} />
      <AmountField name="credit_limit" label={t("cc.limit")} placeholder={t("common.optional")} error={form.err.fields?.credit_limit} />
      <div className="grid gap-1.5">
        <Label htmlFor="statement_day" className="flex items-center gap-1">{t("cc.statementDay")} <Info k="statement" /></Label>
        <DayOfMonthPicker id="statement_day" value={stmt} onChange={setStmt} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="due_day">{t("cc.dueDay")}</Label>
        <DayOfMonthPicker id="due_day" value={due} onChange={setDue} />
      </div>
      <Field name="min_payment_pct" label={t("cc.minPct")} inputMode="numeric" defaultValue="10" error={form.err.fields?.min_payment_pct} />
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={form.busy} className="h-10 rounded-sm">
          {form.busy && <Loader2 className="animate-spin" />} {t("cc.saveCard")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </form>
  )
}

// monthlyPayment mirrors the schedule maths for the preview: annuity pays the same each month,
// flat pays principal/n plus interest on the full principal.
export function monthlyPayment(principal: number, annualRate: number, months: number, method: "annuity" | "flat") {
  if (!(principal > 0) || !(months >= 1) || !(annualRate >= 0)) return null
  const r = annualRate / 100 / 12
  const pay = method === "flat" || r === 0 ? principal / months + (method === "flat" ? principal * r : 0) : (principal * r) / (1 - (1 + r) ** -months)
  return { pay: Math.round(pay), interest: Math.round(pay * months - principal) }
}

const nextMonth = () => {
  const d = new Date(todayISO() + "T00:00:00Z")
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

function NewPlan({ accounts, onDone, onCancel }: { accounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const t = useT()
  const [method, setMethod] = useState<"annuity" | "flat">("annuity")
  const [nums, setNums] = useState({ principal: "", rate: "", tenor: "" })
  const preview = monthlyPayment(toSen(nums.principal), Number(nums.rate.replace(",", ".")), Number(nums.tenor), method)
  const [into, setInto] = useState("")
  const intoOptions = [{ value: "", label: t("cc.alreadyRunning") }, ...accountOptions(accounts.filter((a) => a.is_active && (a.type === "Asset" || a.type === "Expense") && !perContact(a.code) && !isFixedAsset(a)))]
  const [asset, setAsset] = useState("")
  const assets = accounts.filter((a) => a.is_active && isFixedAsset(a))
  const funded = asset || into // an asset or a bank: either way the loan money is recorded
  const form = useForm(async (v, el) => {
    const principal = toSen(v.principal)
    const rate = Number(v.annual_rate.replace(",", "."))
    const tenor = Number(v.tenor_months)
    const fields: Record<string, string> = {}
    if (!(principal > 0)) fields.principal = "positiveAmount"
    if (!(rate >= 0 && rate <= 100)) fields.annual_rate = "max:100"
    if (!(Number.isInteger(tenor) && tenor >= 1 && tenor <= 360)) fields.tenor_months = "max:360"
    if (Object.keys(fields).length) throw new ApiError(400, "validation failed", undefined, "validation", fields)
    const p = await createPlan({ name: v.name, principal, annual_rate: rate, tenor_months: tenor, method, first_due_date: v.first_due_date,
      ...(asset ? { asset_account_id: asset, entry_date: v.entry_date } : into && { received_into_id: into, entry_date: v.entry_date }) })
    el.reset()
    onDone()
    toast(t("cc.planAdded", { name: p.account.name, amount: fmtIDR(p.next?.payment ?? 0) }))
    return ""
  })
  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-4 md:grid-cols-2"
      onInput={(e) => {
        const el = e.currentTarget.elements
        const val = (n: string) => (el.namedItem(n) as HTMLInputElement | null)?.value ?? ""
        setNums({ principal: val("principal"), rate: val("annual_rate"), tenor: val("tenor_months") })
      }}>
      <div className="md:col-span-2"><Status err={form.err} ok={form.ok} /></div>
      <Field name="name" label={t("cc.planName")} placeholder="KPR BTN" error={form.err.fields?.name} />
      <AmountField name="principal" label={t("cc.principal")} placeholder="18.000.000" error={form.err.fields?.principal} />
      <Field name="annual_rate" label={t("cc.rate")} inputMode="decimal" placeholder="9,5" error={form.err.fields?.annual_rate} />
      <Field name="tenor_months" label={t("cc.tenor")} inputMode="numeric" placeholder="36" error={form.err.fields?.tenor_months} />
      <div className="grid gap-1.5 md:col-span-2">
        <span className="text-sm font-medium">{t("cc.method")}</span>
        <Segmented label={t("cc.method")} value={method} onChange={setMethod}
          items={[{ value: "annuity", label: t("glossary.annuity.label") }, { value: "flat", label: t("glossary.flat.label") }]} />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">{t(method === "annuity" ? "cc.annuityHint" : "cc.flatHint")} <Info k={method} /></span>
      </div>
      {preview && (
        <p className="rounded-sm bg-[#eaf2ff] px-3 py-2 text-sm md:col-span-2" aria-live="polite">
          {t("cc.preview", { amount: fmtIDR(preview.pay), interest: fmtIDR(preview.interest) })}
        </p>
      )}
      <DateField name="first_due_date" label={t("cc.firstDue")} defaultValue={nextMonth()} error={form.err.fields?.first_due_date} />
      {assets.length > 0 && (
        <SelectField name="asset_account_id" label={t("fa.loanForAsset")} value={asset} onChange={setAsset}
          options={[{ value: "", label: t("fa.noAsset") }, ...accountOptions(assets)]} />
      )}
      {!asset && <SelectField name="received_into_id" label={t("cc.receivedInto")} value={into} onChange={setInto} options={intoOptions} />}
      {funded && <DateField name="entry_date" label={t("cc.receivedOn")} defaultValue={todayISO()} error={form.err.fields?.entry_date} />}
      <p className="text-xs text-muted-foreground md:col-span-2">{t(asset ? "fa.assetHint" : into ? "cc.receivedHint" : "cc.runningHint")}</p>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={form.busy} className="h-10 rounded-sm">
          {form.busy && <Loader2 className="animate-spin" />} {t("cc.savePlan")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
    </form>
  )
}

export function CardsPage() {
  const t = useT()
  const [cards, setCards] = useState<CardSummary[] | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [adding, setAdding] = useState<"" | "card" | "plan">("")
  const [err, setErr] = useState<FormError>({})
  const [reload, setReload] = useState(0)
  useEffect(() => {
    Promise.all([listCards(), listPlans(), listAccounts()])
      .then(([c, p, a]) => (setCards(c), setPlans(p), setAccounts(a)))
      .catch((e) => setErr(toFormError(e)))
  }, [reload])
  const done = () => setReload((n) => n + 1)
  const shownCards = cards?.filter((c) => c.account.is_active) ?? []

  return (
    <AppShell title={t("nav.cards")}>
      <div className="grid gap-8">
        <Status err={err} ok="" />
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold"><Term k="statement">{t("cc.cards")}</Term></h2>
            {adding !== "card" && <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setAdding("card")}><Plus /> {t("cc.addCard")}</Button>}
          </div>
          {adding === "card" && <Card className="rounded-sm"><CardContent><NewCard onDone={() => (done(), setAdding(""))} onCancel={() => setAdding("")} /></CardContent></Card>}
          {cards && (adding !== "card" || shownCards.length > 0) && (
            <MobileList empty={shownCards.length === 0 ? t("cc.noCards") : undefined} className="md:block">
              {shownCards.map((c) => (
                <MobileItem key={c.account.id} href={`/app/cards/${c.account.id}`}
                  lead={<span className="grid size-9 place-items-center rounded-sm bg-indigo-100 text-indigo-700"><CreditCard className="size-5" /></span>}
                  title={c.account.name}
                  meta={<>
                    <StatusBadge s={c.last} />
                    {c.last.remaining > 0 && <span>{t("cc.dueOn", { date: fmtDate(c.last.due_date) })}</span>}
                    {c.available !== null && <span>{t("cc.available", { amount: fmtIDR(c.available) })}</span>}
                  </>}
                  value={fmtIDR(c.owed)} />
              ))}
            </MobileList>
          )}
        </section>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold"><Term k="installment">{t("cc.plans")}</Term></h2>
            {adding !== "plan" && <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setAdding("plan")}><Plus /> {t("cc.addPlan")}</Button>}
          </div>
          {adding === "plan" && <Card className="rounded-sm"><CardContent><NewPlan accounts={accounts} onDone={() => (done(), setAdding(""))} onCancel={() => setAdding("")} /></CardContent></Card>}
          {plans && (adding !== "plan" || plans.length > 0) && (
            <MobileList empty={plans.length === 0 ? t("cc.noPlans") : undefined} className="md:block">
              {plans.map((p) => (
                <MobileItem key={p.id} href={`/app/installments/${p.id}`}
                  lead={<span className="grid size-9 place-items-center rounded-sm bg-amber-100 text-amber-700"><Landmark className="size-5" /></span>}
                  title={p.account.name}
                  meta={<>
                    <span>{t("cc.paidOf", { n: p.paid_count, total: p.tenor_months })}</span>
                    {p.next && <span>{t("cc.nextDue", { amount: fmtIDR(p.next.payment), date: fmtDate(p.next.due_date) })}</span>}
                  </>}
                  value={fmtIDR(p.remaining)} />
              ))}
            </MobileList>
          )}
        </section>
      </div>
    </AppShell>
  )
}

function Lines({ lines, empty }: { lines: CardLine[]; empty: string }) {
  return (
    <MobileList empty={lines.length === 0 ? empty : undefined} className="md:block">
      {lines.map((l, i) => (
        <MobileItem key={`${l.entry_id}-${i}`} title={l.description || l.counter}
          meta={<><span>{fmtDate(l.entry_date)}</span><span>{l.counter}</span></>}
          value={l.credit > 0 ? fmtIDR(l.credit) : `− ${fmtIDR(l.debit)}`}
          valueClass={l.debit > 0 ? "text-emerald-700" : undefined} />
      ))}
    </MobileList>
  )
}

function PaySheet({ open, onOpenChange, title, accounts, children, onPay }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  accounts: Account[]
  children?: ComponentChildren
  onPay: (from: string, date: string, amount: number) => Promise<void>
}) {
  const t = useT()
  const mobile = useIsMobile()
  const money = moneyAccounts(accounts)
  const [from, setFrom] = useState("")
  useEffect(() => setFrom((f) => f || money[0]?.id || ""), [accounts])
  const form = useForm(async (v) => {
    const amount = v.amount === undefined ? 0 : toSen(v.amount)
    if (v.amount !== undefined && !(amount > 0)) throw new ApiError(400, "validation failed", undefined, "validation", { amount: "positiveAmount" })
    await onPay(from, v.entry_date, amount)
    onOpenChange(false)
    return ""
  })
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={mobile ? "bottom" : "right"} title={title}>
        <form onSubmit={form.onSubmit} noValidate className="grid gap-4 pb-2">
          <Status err={form.err} ok="" />
          {children}
          <SelectField name="from" label={t("tx.paidFrom")} value={from} onChange={setFrom} options={accountOptions(money)} />
          <DateField name="entry_date" label={t("common.date")} defaultValue={todayISO()} />
          <Button type="submit" disabled={form.busy} className="h-11 rounded-sm">
            {form.busy && <Loader2 className="animate-spin" />}
            {t("cc.pay")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value, tone }: { label: ComponentChildren; value: string; tone?: string }) {
  return (
    <div>
      <dt className="flex min-h-7 items-center text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</dd>
    </div>
  )
}

export function CardPage({ id }: { id: string }) {
  const t = useT()
  const { route } = useLocation()
  const [c, setC] = useState<CardSummary | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState("")
  const [err, setErr] = useState<FormError>({})
  const version = useEntriesVersion()
  useEffect(() => {
    getCard(id).then(setC, (e) => setErr(toFormError(e)))
    listAccounts().then(setAccounts, () => {})
  }, [id, version])
  const [stmt, setStmt] = useState<number | null>(null)
  const [due, setDue] = useState<number | null>(null)
  const settings = useForm(async (v) => {
    if (!c) return ""
    const limit = v.credit_limit ? toSen(v.credit_limit) : 0
    if (v.name.trim() && v.name.trim() !== c.account.name) await updateAccount(c.account.id, { name: v.name.trim() })
    setC(await updateCard(id, { statement_day: stmt ?? c.statement_day, due_day: due ?? c.due_day, credit_limit: limit, min_payment_pct: Number(v.min_payment_pct) }))
    toast(t("common.saved"))
    return ""
  })
  const rupiah = (sen: number) => (sen / 100).toLocaleString("id-ID")

  // A paid-off card can be put away; its history stays and Accounts can bring it back.
  async function archive() {
    if (!c) return
    try {
      await updateAccount(c.account.id, { is_active: false })
      toast(t("cc.archived", { name: c.account.name }))
      route("/app/cards")
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  async function pay(from: string, date: string, sen: number) {
    if (!c) return
    await postEntry({ kind: "transfer", entry_date: date, amount: sen, from_account_id: from, to_account_id: c.account.id, description: t("cc.billPayment", { name: c.account.name }) })
    toast(t("cc.paid", { amount: fmtIDR(sen) }))
  }

  return (
    <AppShell title={c?.account.name ?? t("cc.card")}
      back={{ href: "/app/cards", label: t("nav.cards") }}>
      <Status err={err} ok="" />
      {c && (
        <div className="grid gap-6">
          <Card className="rounded-sm bg-gradient-to-b from-[#eaf2ff]/70 to-white">
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium"><Term k="statement">{t("cc.lastBill", { date: fmtDate(c.last.end) })}</Term></span>
                <StatusBadge s={c.last} />
              </div>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label={t("cc.total")} value={fmtIDR(c.last.total)} />
                <Stat label={<Term k="minimumPayment">{t("cc.minimum")}</Term>} value={fmtIDR(c.last.minimum)} />
                <Stat label={t("cc.remaining")} value={fmtIDR(c.last.remaining)} tone={c.last.status === "overdue" ? "text-rose-700" : undefined} />
                <Stat label={t("cc.due")} value={fmtDate(c.last.due_date)} />
              </dl>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
                <span>{t("cc.owedNow", { amount: fmtIDR(c.owed) })}</span>
                {c.available !== null && <span>{t("cc.available", { amount: fmtIDR(c.available) })}</span>}
              </div>
              <Button className="h-11 justify-self-start rounded-sm px-8" onClick={() => (setAmount(rupiah(c.last.remaining || c.owed)), setPaying(true))} disabled={c.owed <= 0}>
                {t("cc.payBill")}
              </Button>
            </CardContent>
          </Card>

          <PaySheet open={paying} onOpenChange={setPaying} title={t("cc.payBill")} accounts={accounts} onPay={pay}>
            <AmountField name="amount" label={t("common.amount")} value={amount} onInput={(e) => setAmount((e.currentTarget as HTMLInputElement).value)} />
            <div className="flex flex-wrap gap-2">
              {[["cc.remaining", c.last.remaining], ["cc.minimum", c.last.min_remaining], ["cc.owedAll", c.owed]].filter(([, v]) => (v as number) > 0).map(([k, v]) => (
                <button key={k as string} type="button" onClick={() => setAmount(rupiah(v as number))}
                  className="h-9 rounded-full border px-3 text-sm hover:bg-[#eaf2ff]">
                  {t(k as Key)} {fmtIDR(v as number)}
                </button>
              ))}
            </div>
          </PaySheet>

          <section className="grid gap-2">
            <h2 className="font-semibold">{t("cc.currentCycle", { start: fmtDate(c.current.start), end: fmtDate(c.current.end) })}</h2>
            <Lines lines={c.current.lines ?? []} empty={t("cc.noCharges")} />
          </section>
          <section className="grid gap-2">
            <h2 className="font-semibold">{t("cc.billLines", { start: fmtDate(c.last.start), end: fmtDate(c.last.end) })}</h2>
            <Lines lines={c.last.lines ?? []} empty={t("cc.noCharges")} />
          </section>

          <Card className="rounded-sm">
            <CardContent>
              <form onSubmit={settings.onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
                <h2 className="font-semibold md:col-span-2">{t("cc.settings")}</h2>
                <div className="md:col-span-2"><Status err={settings.err} ok={settings.ok} /></div>
                <div className="md:col-span-2"><Field name="name" label={t("cc.name")} defaultValue={c.account.name} /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="s-stmt">{t("cc.statementDay")}</Label>
                  <DayOfMonthPicker id="s-stmt" value={stmt ?? c.statement_day} onChange={setStmt} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="s-due">{t("cc.dueDay")}</Label>
                  <DayOfMonthPicker id="s-due" value={due ?? c.due_day} onChange={setDue} />
                </div>
                <AmountField name="credit_limit" label={t("cc.limit")} defaultValue={c.credit_limit ? rupiah(c.credit_limit) : ""} />
                <Field name="min_payment_pct" label={t("cc.minPct")} inputMode="numeric" defaultValue={String(c.min_payment_pct)} />
                <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                  <Button type="submit" variant="outline" disabled={settings.busy} className="rounded-sm">
                    {settings.busy && <Loader2 className="animate-spin" />}
                    {t("common.save")}
                  </Button>
                  {c.owed === 0 ? (
                    <Button type="button" variant="ghost" className="text-rose-700" onClick={archive}><Archive /> {t("cc.archive")}</Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("cc.archiveAfterPaid")}</span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  )
}

export function PlanPage({ id }: { id: string }) {
  const t = useT()
  const { route } = useLocation()
  const [p, setP] = useState<Plan | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [paying, setPaying] = useState(false)
  const [err, setErr] = useState<FormError>({})
  const version = useEntriesVersion()
  useEffect(() => {
    getPlan(id).then(setP, (e) => setErr(toFormError(e)))
    listAccounts().then(setAccounts, () => {})
  }, [id, version])

  async function pay(from: string, date: string) {
    const next = p?.next
    setP(await payInstallment(id, { from_account_id: from, entry_date: date }))
    if (next) toast(t("cc.installmentPaid", { n: next.seq, amount: fmtIDR(next.payment) }))
  }
  async function remove() {
    try {
      await deletePlan(id)
      route("/app/cards")
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  return (
    <AppShell title={p?.account.name ?? t("cc.plan")} term="installment"
      back={{ href: "/app/cards", label: t("nav.cards") }}>
      <Status err={err} ok="" />
      {p && (
        <div className="grid gap-6">
          <Card className="rounded-sm bg-gradient-to-b from-[#eaf2ff]/70 to-white">
            <CardContent className="grid gap-4">
              <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                {fmtIDR(p.principal)} · {(p.annual_rate_bp / 100).toLocaleString("id-ID")}% · {t("cc.months", { n: p.tenor_months })} · <Term k={p.method}>{t(`glossary.${p.method}.label` as Key)}</Term>
              </p>
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label={t("cc.remainingPrincipal")} value={fmtIDR(p.remaining)} />
                <Stat label={t("cc.paidCount")} value={`${p.paid_count}/${p.tenor_months}`} />
                <Stat label={t("cc.totalInterest")} value={fmtIDR(p.total_interest)} />
                <Stat label={t("cc.nextPayment")} value={p.next ? fmtIDR(p.next.payment) : "—"} />
              </dl>
              <div className="flex flex-wrap gap-2">
                {p.next ? (
                  <Button className="h-11 rounded-sm px-6" onClick={() => setPaying(true)}>
                    {t("cc.payInstallment", { n: p.next.seq, date: fmtDate(p.next.due_date) })}
                  </Button>
                ) : (
                  <Badge className="rounded-sm bg-emerald-50 text-emerald-700">{t("cc.status.paid")}</Badge>
                )}
                {p.paid_count === 0
                  ? <Button variant="ghost" className="text-rose-700" onClick={remove}><Trash2 /> {t("cc.deletePlan")}</Button>
                  : <span className="self-center text-xs text-muted-foreground">{t("cc.planKeeps")}</span>}
              </div>
            </CardContent>
          </Card>

          {p.next && (
            <PaySheet open={paying} onOpenChange={setPaying} title={t("cc.payInstallment", { n: p.next.seq, date: fmtDate(p.next.due_date) })} accounts={accounts} onPay={pay}>
              <p className="text-sm">{t("cc.split", { principal: fmtIDR(p.next.principal), interest: fmtIDR(p.next.interest), total: fmtIDR(p.next.payment) })}</p>
            </PaySheet>
          )}

          <section className="grid gap-2">
            <h2 className="font-semibold">{t("cc.schedule")}</h2>
            <MobileList>
              {p.rows?.map((r) => (
                <MobileItem key={r.seq} title={`${r.seq}. ${fmtDate(r.due_date)}`}
                  meta={<><span>{t("cc.splitShort", { principal: fmtIDR(r.principal), interest: fmtIDR(r.interest) })}</span>
                    {r.paid && <span className="text-emerald-700">{t("cc.paidEntry")}</span>}</>}
                  value={fmtIDR(r.payment)} valueClass={r.paid ? "text-muted-foreground line-through" : undefined} />
              ))}
            </MobileList>
            <TableCard className="hidden md:block">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("cc.due")}</th>
                  <th className="text-right!">{t("cc.principalCol")}</th>
                  <th className="text-right!">{t("cc.interestCol")}</th>
                  <th className="text-right!">{t("cc.paymentCol")}</th>
                  <th className="text-right!">{t("cc.remainingPrincipal")}</th>
                  <th>{t("acct.status")}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {p.rows?.map((r) => (
                  <tr key={r.seq} className={cn(r.paid && "text-muted-foreground", p.next?.seq === r.seq && "bg-[#f4f8ff]")}>
                    <td>{r.seq}</td>
                    <td className="whitespace-nowrap">{fmtDate(r.due_date)}</td>
                    <td className="text-right">{fmtIDR(r.principal)}</td>
                    <td className="text-right">{fmtIDR(r.interest)}</td>
                    <td className="text-right font-medium">{fmtIDR(r.payment)}</td>
                    <td className="text-right">{fmtIDR(r.remaining)}</td>
                    <td>{r.paid ? <span className="text-emerald-700">{t("cc.paidEntry")}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          </section>
        </div>
      )}
    </AppShell>
  )
}
