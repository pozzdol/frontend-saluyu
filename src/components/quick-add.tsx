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
import { deleteEntry, listAccounts, perContact, postEntry, type Account, type PostEntryInput } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { press, show, toSenDigits, type Key as PadKey } from "@/lib/keypad"
import { cn, fmtIDR, todayISO } from "@/lib/utils"

type Kind = PostEntryInput["kind"]

// The wallet is the money account; the tile grid is what the money went to or came from.
const shape: Record<Kind, { tiles: Account["type"]; walletIsFrom: boolean }> = {
  expense: { tiles: "Expense", walletIsFrom: true },
  income: { tiles: "Revenue", walletIsFrom: false },
  transfer: { tiles: "Asset", walletIsFrom: true },
}

const pad: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"]

const walletKey = "saluyu.quickadd.wallet"
const lastWallet = () => { try { return localStorage.getItem(walletKey) ?? "" } catch { return "" } }
const keepWallet = (id: string) => { try { localStorage.setItem(walletKey, id) } catch { /* private mode */ } }

const dayBefore = (iso: string) => new Date(Date.parse(iso) - 864e5).toISOString().slice(0, 10)

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [kind, setKind] = useState<Kind>("expense")
  const [digits, setDigits] = useState("")
  const [wallet, setWallet] = useState("")
  const [tile, setTile] = useState("")
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    listAccounts()
      .then((list) => {
        setAccounts(list)
        const wallets = list.filter((a) => a.is_active && a.type === "Asset" && !perContact(a.code))
        setWallet(wallets.find((a) => a.id === lastWallet())?.id ?? wallets[0]?.id ?? "")
      })
      .catch((e) => setErr(toFormError(e)))
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
  const wallets = active.filter((a) => a.type === "Asset")
  const tiles = active
    .filter((a) => a.type === shape[kind].tiles && a.id !== wallet)
    .sort((a, b) => b.uses_30d - a.uses_30d || a.code.localeCompare(b.code))
  const today = todayISO()
  const yesterday = dayBefore(today)
  const amount = toSenDigits(digits)
  const tileAccount = tiles.find((a) => a.id === tile)

  async function save() {
    if (!tileAccount) return
    setBusy(true)
    setErr({})
    const [from, to] = shape[kind].walletIsFrom ? [wallet, tile] : [tile, wallet]
    try {
      const e = await postEntry({ kind, entry_date: date, amount, from_account_id: from, to_account_id: to, description: note.trim() })
      keepWallet(wallet)
      onDone()
      toast(t("qa.saved", { amount: fmtIDR(amount), account: tileAccount.name }), {
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

  const chip = (on: boolean) =>
    cn("h-11 shrink-0 rounded-full border px-4 text-sm md:h-9", on ? "border-primary bg-[#eaf2ff] font-medium text-primary" : "hover:bg-muted")

  return (
    <div className="grid gap-3">
      <Segmented
        label={t("tx.type")}
        value={kind}
        onChange={(k) => (setKind(k), setTile(""))}
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
              <button key={a.id} type="button" aria-pressed={a.id === tile} onClick={() => setTile(a.id)}
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
        onInput={(e) => setNote(e.currentTarget.value)} className="h-11 rounded-sm md:h-10" maxLength={200} />

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
  return (
    <>
      {variant === "fab" ? (
        <button type="button" aria-label={t("qa.title")} onClick={() => setOpen(true)}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 lg:hidden">
          <Plus className="size-6" />
        </button>
      ) : (
        <Button className="h-10 w-full rounded-sm" onClick={() => setOpen(true)}>
          <Plus /> {t("qa.open")}
        </Button>
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
