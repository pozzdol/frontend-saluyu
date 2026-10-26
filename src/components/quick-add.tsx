import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Delete, Loader2, Plus, UserRound } from "lucide-react"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { AccountIcon } from "@/components/account-icon"
import { Status, accountOptions, toFormError, type FormError } from "@/components/field"
import { DatePicker, SelectPicker, fmtDate, useIsMobile } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import { toast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { createContact, deleteEntry, isFixedAsset, isMoney, listAccounts, listCategoryRules, listContacts, perContact, postEntry, postLoan, ruleFor, type Account, type CategoryRule, type Contact, type LoanType, type PostEntryInput } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { press, show, toSenDigits, type Key as PadKey } from "@/lib/keypad"
import { cn, fmtIDR, todayISO } from "@/lib/utils"
import { Loading, Skeleton } from "@/components/skeleton"
import { enqueue, isOffline, useOutboxCount } from "@/lib/outbox"

type Kind = PostEntryInput["kind"]

// The wallet is the money account (cards too, except for income); the tile grid is what the
// money went to or came from. A transfer can pay off a card or loan.
const shape: Record<Kind, { tile: (a: Account) => boolean; wallet: (a: Account) => boolean; walletIsFrom: boolean }> = {
  expense: { tile: (a) => a.type === "Expense", wallet: isMoney, walletIsFrom: true },
  income: { tile: (a) => a.type === "Revenue", wallet: (a) => a.type === "Asset" && !isFixedAsset(a), walletIsFrom: false },
  transfer: { tile: (a) => (a.type === "Asset" && !isFixedAsset(a)) || a.type === "Liability", wallet: isMoney, walletIsFrom: true },
}

const pad: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"]

const walletKey = "saluyu.quickadd.wallet"
const lastWallet = () => { try { return localStorage.getItem(walletKey) ?? "" } catch { return "" } }
const keepWallet = (id: string) => { try { localStorage.setItem(walletKey, id) } catch { /* private mode */ } }

const cacheKey = "saluyu.quickadd.accounts"
const cache = {
  get: (): Account[] | null => { try { return JSON.parse(localStorage.getItem(cacheKey) ?? "null") } catch { return null } },
  set: (list: Account[]) => { try { localStorage.setItem(cacheKey, JSON.stringify(list)) } catch { /* private mode */ } },
}

// Picking a person instead of a category records a loan. Which way follows the tab and what
// is already owed: money out pays back what I owe first, otherwise it lends; money in is
// their repayment while they owe me, otherwise I borrow.
const loanType = (kind: Kind, c: Contact): LoanType =>
  kind === "expense" ? (c.payable > 0 ? "lunas_keluar" : "talangan") : c.receivable > 0 ? "lunas_masuk" : "pinjam"
const person = "c:" // tile ids of people carry this prefix

const dayBefore = (iso: string) => new Date(Date.parse(iso) - 864e5).toISOString().slice(0, 10)

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const t = useT()
  // Opened from a card's page, the card is what you are paying with.
  const { path } = useLocation()
  const here = path.match(/^\/app\/cards\/([^/]+)$/)?.[1]
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [kind, setKind] = useState<Kind>("expense")
  const [digits, setDigits] = useState("")
  const [wallet, setWallet] = useState("")
  const [tile, setTile] = useState("")
  const [tilePicked, setTilePicked] = useState(false) // a tap beats a rule's suggestion
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [naming, setNaming] = useState<string | null>(null) // the "+ new person" box
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    listCategoryRules().then(setRules, () => {})
    listContacts().then(setContacts, () => {})
    const use = (list: Account[]) => {
      setAccounts(list)
      const wallets = list.filter((a) => a.is_active && isMoney(a) && a.type === "Asset") // default: never a card
      const card = here && list.find((a) => a.id === here && a.is_active)
      setWallet(card ? card.id : wallets.find((a) => a.id === lastWallet())?.id ?? wallets[0]?.id ?? "")
    }
    // Offline, the accounts from the last successful load still let you record.
    listAccounts()
      .then((list) => (use(list), cache.set(list)))
      .catch((e) => {
        const saved = cache.get()
        if (saved) use(saved)
        else setErr(toFormError(e))
      })
  }, [])

  // Typing on a keyboard works too, unless the note field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return
      if (/^\d$/.test(e.key)) setDigits((d) => press(d, e.key as PadKey))
      else if (e.key === "Backspace") setDigits((d) => press(d, "back"))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const active = accounts?.filter((a) => a.is_active && !perContact(a.code)) ?? []
  const wallets = active.filter(shape[kind].wallet)
  const tiles = active
    // System categories (interest & fees, unrecorded cash) are not everyday tiles until used.
    .filter((a) => shape[kind].tile(a) && a.id !== wallet && (a.has_entries || !systemCodes.includes(a.code)))
    .sort((a, b) => b.uses_30d - a.uses_30d || a.code.localeCompare(b.code))
  const today = todayISO()
  const yesterday = dayBefore(today)
  const amount = toSenDigits(digits)
  // Money back from a spending category is a refund: it lowers what that category spent.
  const refunds = kind === "income"
    ? active.filter((a) => a.type === "Expense" && a.has_entries).sort((a, b) => b.uses_30d - a.uses_30d || a.code.localeCompare(b.code))
    : []
  const tileAccount = tiles.find((a) => a.id === tile) ?? refunds.find((a) => a.id === tile)
  const contact = contacts.find((c) => person + c.id === tile)
  const loan = contact && kind !== "transfer" ? loanType(kind, contact) : null
  useEffect(() => setErr({}), [digits, tile, kind])
  const walletLabel = kind === "transfer" ? t("tx.from") : kind === "income" ? t("tx.receivedInto") : t("tx.paidFrom")

  function switchKind(k: Kind) {
    setKind(k)
    setTile("")
    // Income cannot land on a card: fall back to the first account that fits.
    if (!active.some((a) => a.id === wallet && shape[k].wallet(a))) setWallet(active.find(shape[k].wallet)?.id ?? "")
  }

  async function save() {
    // Save stays enabled and says what is missing, instead of a grey button with no reason.
    if (amount <= 0) return setErr({ message: t("qa.needAmount") })
    if (contact && loan) return saveLoan(contact, loan)
    if (!tileAccount) return setErr({ message: t(kind === "transfer" ? "qa.needTo" : kind === "income" ? "qa.needSource" : "qa.needCategory") })
    setBusy(true)
    setErr({})
    const [from, to] = shape[kind].walletIsFrom ? [wallet, tile] : [tile, wallet]
    const input = { kind, entry_date: date, amount, from_account_id: from, to_account_id: to, description: note.trim(), client_id: crypto.randomUUID() }
    try {
      const e = await postEntry(input)
      keepWallet(wallet)
      onDone()
      toast(t("qa.saved", { amount: fmtIDR(amount), account: tileAccount.name }), {
        action: {
          label: t("common.undo"),
          run: () => deleteEntry(e.id).then(() => toast(t("qa.undone")), (x) => toast(toFormError(x).message ?? "", { tone: "error" })),
        },
      })
    } catch (e) {
      if (isOffline(e)) {
        // Kept on this device and sent when the connection is back (OutboxSync).
        enqueue(input)
        keepWallet(wallet)
        onDone()
        toast(t("qa.queued", { amount: fmtIDR(amount), account: tileAccount.name }))
      } else setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveLoan(c: Contact, type: LoanType) {
    setBusy(true)
    setErr({})
    try {
      // A repayment above what is owed turns the rest into a loan the other way.
      const e = await postLoan({ type, contact_id: c.id, account_id: wallet, amount, entry_date: date, description: note.trim(), confirm_overpay: true })
      keepWallet(wallet)
      onDone()
      toast(t("qa.saved", { amount: fmtIDR(amount), account: c.name }), {
        action: {
          label: t("common.undo"),
          run: () => deleteEntry(e.id).then(() => toast(t("qa.undone")), (x) => toast(toFormError(x).message ?? "", { tone: "error" })),
        },
      })
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  async function addPerson(name: string) {
    if (!name.trim()) return setNaming(null)
    try {
      const c = await createContact(name.trim())
      setContacts((list) => [...list, { ...c, receivable: 0, payable: 0, net: 0, limit: null }])
      setTile(person + c.id)
      setNaming(null)
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  // What saving a person does, in words, with what is owed and the lending limit.
  const loanHint = contact && loan && t(`qa.loan.${loan}`, {
    name: contact.name,
    amount: fmtIDR(loan === "lunas_keluar" ? contact.payable : contact.receivable),
  }) + (loan === "talangan" && contact.limit && contact.receivable + amount > contact.limit
    ? " " + t("qa.overLimit", { limit: fmtIDR(contact.limit) })
    : "")

  const tileButton = (id: string, label: string, icon: preact.ComponentChildren) => (
    <button key={id} type="button" aria-pressed={id === tile} onClick={() => (setTile(id), setTilePicked(true))}
      className={cn("grid min-h-20 justify-items-center content-start gap-1.5 rounded-sm border p-2 text-center text-xs leading-tight [@media(max-height:760px)]:min-h-16 [@media(max-height:760px)]:p-1.5",
        id === tile ? "border-primary bg-[#eaf2ff] ring-1 ring-primary" : "hover:bg-muted")}>
      {icon}
      <span className="line-clamp-2 break-words">{label}</span>
    </button>
  )
  const personIcon = <span className="grid size-9 place-items-center rounded-full bg-orange-100 text-orange-700"><UserRound className="size-4" /></span>

  const chip = (on: boolean) =>
    cn("h-11 shrink-0 rounded-full border px-4 text-sm md:h-9", on ? "border-primary bg-[#eaf2ff] font-medium text-primary" : "hover:bg-muted")

  return (
    <div className="grid gap-3">
      <Segmented
        label={t("tx.type")}
        value={kind}
        onChange={switchKind}
        items={[
          { value: "expense", label: <><ArrowUpRight className="size-4" />{t("qa.out")}</> },
          { value: "income", label: <><ArrowDownLeft className="size-4" />{t("qa.in")}</> },
          { value: "transfer", label: <><ArrowLeftRight className="size-4" />{t("qa.move")}</> },
        ]}
      />

      <p aria-live="polite" className="text-center text-4xl font-semibold tracking-tight tabular-nums">
        <span className="text-xl text-muted-foreground">Rp </span>
        {show(digits)}
      </p>

      <Status err={err} ok="" />

      <div className="grid gap-1 text-sm">
        <span className="text-muted-foreground">{walletLabel}</span>
        <SelectPicker aria-label={walletLabel} title={walletLabel} value={wallet} onChange={(v) => (setWallet(v), v === tile && setTile(""))} options={accountOptions(wallets)} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm text-muted-foreground">{kind === "transfer" ? t("tx.to") : kind === "income" ? t("tx.source") : t("tx.category")}</legend>
        {accounts === null ? (
          !err.message && (
            <Loading className="grid-cols-4 gap-2">
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="min-h-20 rounded-sm border bg-muted/60 [@media(max-height:760px)]:min-h-16" />)}
            </Loading>
          )
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {tiles.map((a) => tileButton(a.id, a.name, <AccountIcon account={a} />))}
          </div>
        )}
      </fieldset>

      {accounts !== null && refunds.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm text-muted-foreground">{t("qa.refund")}</legend>
          <div className="grid grid-cols-4 gap-2">
            {refunds.map((a) => tileButton(a.id, a.name, <AccountIcon account={a} />))}
          </div>
        </fieldset>
      )}

      {accounts !== null && kind !== "transfer" && (
        <fieldset>
          <legend className="mb-2 text-sm text-muted-foreground">{t("qa.people")}</legend>
          <div className="grid grid-cols-4 gap-2">
            {contacts.map((c) => tileButton(person + c.id, c.name, personIcon))}
            {naming === null ? (
              <button type="button" onClick={() => setNaming("")}
                className="grid min-h-20 place-items-center gap-1 rounded-sm border border-dashed p-2 text-xs text-muted-foreground hover:bg-muted [@media(max-height:760px)]:min-h-16">
                <Plus className="size-4" />{t("qa.newPerson")}
              </button>
            ) : (
              <form className="col-span-4 flex gap-2" onSubmit={(e) => (e.preventDefault(), addPerson(naming))}>
                <Input autoFocus value={naming} onInput={(e) => setNaming(e.currentTarget.value)} maxLength={100}
                  aria-label={t("qa.personName")} placeholder={t("qa.personName")} className="h-11 flex-1 rounded-sm md:h-10" />
                <Button type="submit" className="h-11 rounded-sm md:h-10">{t("common.add")}</Button>
                <Button type="button" variant="ghost" className="h-11 md:h-10" onClick={() => setNaming(null)}>{t("common.cancel")}</Button>
              </form>
            )}
          </div>
          {loanHint && <p className="mt-2 text-sm text-muted-foreground">{loanHint}</p>}
        </fieldset>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        <button type="button" className={chip(date === today)} onClick={() => setDate(today)}>{t("qa.today")}</button>
        <button type="button" className={chip(date === yesterday)} onClick={() => setDate(yesterday)}>{t("qa.yesterday")}</button>
        <DatePicker value={date} onChange={(d) => setDate(d || today)} title={t("common.date")}
          display={date === today || date === yesterday ? t("qa.otherDate") : fmtDate(date)}
          className={cn(chip(date !== today && date !== yesterday), "w-auto")} />
      </div>

      <Input aria-label={t("common.note")} placeholder={`${t("common.note")} (${t("common.optional").toLowerCase()})`} value={note}
        onInput={(e) => {
          const v = e.currentTarget.value
          setNote(v)
          // "grab ke kantor" picks Transportasi when a rule says GRAB -> Transportasi.
          const hit = !tilePicked && ruleFor(rules, v, amount)
          if (hit && tiles.some((a) => a.id === hit.account_id)) setTile(hit.account_id)
        }} className="h-11 rounded-sm md:h-10" maxLength={200} />

      {/* Keypad and Save stay pinned at the bottom of the sheet; the choices above scroll. */}
      <div className="sticky bottom-0 -mx-4 grid gap-2 border-t bg-background px-4 pt-3 pb-1">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("qa.keypad")}>
        {pad.map((k) => (
          <button key={k} type="button" onClick={() => setDigits((d) => press(d, k))}
            aria-label={k === "back" ? t("qa.backspace") : undefined}
            className="grid h-12 place-items-center rounded-sm bg-muted text-xl font-medium tabular-nums active:bg-[#dbe7fb] md:h-11 md:text-lg [@media(max-height:760px)]:h-10">
            {k === "back" ? <Delete className="size-5" /> : k}
          </button>
        ))}
      </div>

      <Button className="h-12 rounded-sm text-base" disabled={busy || !wallet} onClick={save}>
        {busy && <Loader2 className="animate-spin" />}
        {t("common.save")}
      </Button>
      </div>
    </div>
  )
}

const systemCodes = ["5108", "5111", "5112", "5199"] // Denda & Bunga Lain, Bunga Pinjaman, Bunga & Denda Kartu, Beban Tunai Lain-lain

// QuickAdd is the always-there way to record: a floating button on phones, a sidebar button on desktop.
export function QuickAdd({ variant }: { variant: "fab" | "sidebar" }) {
  const t = useT()
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const waiting = useOutboxCount()
  return (
    <>
      {variant === "fab" ? (
        <button type="button" aria-label={t("qa.title")} onClick={() => setOpen(true)}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 lg:hidden print:hidden">
          <Plus className="size-6" />
          {waiting > 0 && (
            <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-amber-500 text-xs font-semibold text-white">
              {waiting}<span className="sr-only"> {t("qa.waiting", { n: waiting })}</span>
            </span>
          )}
        </button>
      ) : (
        <div className="grid gap-1">
          <Button className="h-10 w-full rounded-sm" onClick={() => setOpen(true)}>
            <Plus /> {t("qa.open")}
          </Button>
          {waiting > 0 && <p className="text-center text-xs text-amber-800">{t("qa.waiting", { n: waiting })}</p>}
        </div>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={mobile ? "bottom" : "right"} title={t("qa.title")} className={cn(mobile && "max-h-[94svh]")}>
          {/* Mounted only while open: every opening starts clean with fresh usage counts. */}
          {open && <QuickAddForm onDone={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </>
  )
}
