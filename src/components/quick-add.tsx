import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Delete, Loader2, Plus } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AccountIcon } from "@/components/account-icon"
import { Status, accountOptions, toFormError, type FormError } from "@/components/field"
import { DatePicker, SelectPicker, fmtDate, useIsMobile } from "@/components/picker"
import { Segmented } from "@/components/segmented"
import { toast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { deleteEntry, isMoney, listAccounts, listCategoryRules, perContact, postEntry, ruleFor, type Account, type CategoryRule, type PostEntryInput } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { press, show, toSenDigits, type Key as PadKey } from "@/lib/keypad"
import { cn, fmtIDR, todayISO } from "@/lib/utils"
import { enqueue, isOffline, useOutboxCount } from "@/lib/outbox"

type Kind = PostEntryInput["kind"]

// The wallet is the money account (cards too, except for income); the tile grid is what the
// money went to or came from. A transfer can pay off a card or loan.
const shape: Record<Kind, { tile: (a: Account) => boolean; wallet: (a: Account) => boolean; walletIsFrom: boolean }> = {
  expense: { tile: (a) => a.type === "Expense", wallet: isMoney, walletIsFrom: true },
  income: { tile: (a) => a.type === "Revenue", wallet: (a) => a.type === "Asset", walletIsFrom: false },
  transfer: { tile: (a) => a.type === "Asset" || a.type === "Liability", wallet: isMoney, walletIsFrom: true },
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

const dayBefore = (iso: string) => new Date(Date.parse(iso) - 864e5).toISOString().slice(0, 10)

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [kind, setKind] = useState<Kind>("expense")
  const [digits, setDigits] = useState("")
  const [wallet, setWallet] = useState("")
  const [tile, setTile] = useState("")
  const [tilePicked, setTilePicked] = useState(false) // a tap beats a rule's suggestion
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    listCategoryRules().then(setRules, () => {})
    const use = (list: Account[]) => {
      setAccounts(list)
      const wallets = list.filter((a) => a.is_active && a.type === "Asset" && !perContact(a.code)) // default: never a card
      setWallet(wallets.find((a) => a.id === lastWallet())?.id ?? wallets[0]?.id ?? "")
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
    .filter((a) => shape[kind].tile(a) && a.id !== wallet)
    .sort((a, b) => b.uses_30d - a.uses_30d || a.code.localeCompare(b.code))
  const today = todayISO()
  const yesterday = dayBefore(today)
  const amount = toSenDigits(digits)
  const tileAccount = tiles.find((a) => a.id === tile)

  function switchKind(k: Kind) {
    setKind(k)
    setTile("")
    // Income cannot land on a card: fall back to the first account that fits.
    if (!active.some((a) => a.id === wallet && shape[k].wallet(a))) setWallet(active.find(shape[k].wallet)?.id ?? "")
  }

  async function save() {
    if (!tileAccount) return
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
        <span className="text-muted-foreground">{shape[kind].walletIsFrom ? t("tx.paidFrom") : t("tx.receivedInto")}</span>
        <SelectPicker aria-label={t("qa.wallet")} title={t("qa.wallet")} value={wallet} onChange={(v) => (setWallet(v), v === tile && setTile(""))} options={accountOptions(wallets)} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm text-muted-foreground">{kind === "transfer" ? t("tx.to") : kind === "income" ? t("tx.source") : t("tx.category")}</legend>
        {accounts === null ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {tiles.map((a) => (
              <button key={a.id} type="button" aria-pressed={a.id === tile} onClick={() => (setTile(a.id), setTilePicked(true))}
                className={cn("grid min-h-20 justify-items-center content-start gap-1.5 rounded-sm border p-2 text-center text-xs leading-tight",
                  a.id === tile ? "border-primary bg-[#eaf2ff] ring-1 ring-primary" : "hover:bg-muted")}>
                <AccountIcon account={a} />
                <span className="line-clamp-2 break-words">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </fieldset>

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
            className="grid h-12 place-items-center rounded-sm bg-muted text-xl font-medium tabular-nums active:bg-[#dbe7fb] md:h-11 md:text-lg">
            {k === "back" ? <Delete className="size-5" /> : k}
          </button>
        ))}
      </div>

      <Button className="h-12 rounded-sm text-base" disabled={busy || amount <= 0 || !tileAccount || !wallet} onClick={save}>
        {busy && <Loader2 className="animate-spin" />}
        {t("common.save")}
      </Button>
      </div>
    </div>
  )
}

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
