import { Loader2, PenLine, Send } from "lucide-react"
import { useEffect, useRef, useState } from "preact/hooks"
import { Status, toFormError, type FormError } from "@/components/field"
import { toast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  assistantDraft, createAccount, createContact, defaultGroup, listAccounts, listContacts, nextCode, postEntry, postLoan,
  type Account, type AssistantReply, type ChatMessage, type Contact, type DraftItem, type PostEntryInput,
} from "@/lib/api"
import { useT } from "@/lib/i18n"
import { cn, fmtIDR, todayISO } from "@/lib/utils"

const refs = (i: DraftItem) => (i.target === "entry" ? [i.from, i.to] : [i.account, i.contact, ...(i.my_share > 0 ? [i.expense_account] : [])])
const ready = (r: AssistantReply | null) => !!r?.items.length && r.items.every((i) => i.amount > 0 && refs(i).every(Boolean))

// Assistant drafts entries from a chat ("54rb makan siang dari bca") and keeps revising the draft
// with each message ("ubah jadi 100rb", "pakai mandiri"). Saving goes through the normal endpoints.
export function Assistant({ onDone, onManual }: { onDone: () => void; onManual: () => void }) {
  const t = useT()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState<AssistantReply | null>(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listAccounts().then(setAccounts, (e) => setErr(toFormError(e)))
    listContacts().then(setContacts, () => {})
  }, [])
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages, busy])

  async function send(e: SubmitEvent) {
    e.preventDefault()
    if (!text.trim() || busy) return
    const chat: ChatMessage[] = [...messages, { role: "user", text: text.trim() }]
    setMessages(chat)
    setText("")
    setBusy(true)
    setErr({})
    try {
      const r = await assistantDraft(todayISO(), chat)
      setMessages([...chat, { role: "model", text: JSON.stringify(r) }])
      if (r.items.length) setDraft(r)
      if (r.save) await save(r, [...chat, { role: "model", text: JSON.stringify(r) }])
    } catch (x) {
      setMessages(messages) // the message did not get an answer: let the user send it again
      setText(chat[chat.length - 1].text)
      setErr(toFormError(x))
    } finally {
      setBusy(false)
    }
  }

  async function save(r: AssistantReply, chat = messages) {
    setBusy(true)
    setErr({})
    let list = accounts
    const made = new Map<string, string>() // "new:<name>" -> the id it got
    const id = (ref: string) => made.get(ref) ?? ref
    let items = r.items
    try {
      for (const n of r.new_accounts) {
        const ref = "new:" + n.name
        if (made.has(ref) || !items.some((i) => refs(i).includes(ref))) continue
        const a = await createAccount({ code: nextCode(list, n.type), name: n.name, type: n.type, category: defaultGroup[n.type], ...(n.icon && { icon: n.icon }) })
        list = [...list, a]
        made.set(ref, a.id)
      }
      for (const ref of new Set(items.map((i) => i.contact).filter((c) => c.startsWith("new:")))) {
        made.set(ref, (await createContact(ref.slice(4))).id)
      }
      const total = items.length
      for (const i of items) {
        const amount = Math.round(i.amount * 100)
        if (i.target === "entry") {
          await postEntry({
            kind: i.kind as PostEntryInput["kind"], entry_date: i.entry_date, amount, from_account_id: id(i.from), to_account_id: id(i.to),
            description: i.description, next_period: i.next_period, client_id: crypto.randomUUID(),
          })
        } else {
          await postLoan({
            type: i.loan_type as never, contact_id: id(i.contact), account_id: id(i.account), amount, entry_date: i.entry_date,
            description: i.description, confirm_overpay: i.confirm_overpay,
            ...(i.my_share > 0 && { my_share: Math.round(i.my_share * 100), expense_account_id: id(i.expense_account) }),
          })
        }
        items = items.slice(1)
      }
      toast(t("qa.ai.saved", { n: total }))
      onDone()
    } catch (x) {
      // What was saved stays saved. The draft keeps the rest, pointing at what was just created,
      // so asking again or pressing Save does not create it twice.
      const fill = (i: DraftItem): DraftItem => ({ ...i, from: id(i.from), to: id(i.to), account: id(i.account), contact: id(i.contact), expense_account: id(i.expense_account) })
      const left = { ...r, save: false, items: items.map(fill), new_accounts: r.new_accounts.filter((n) => !made.has("new:" + n.name)) }
      setAccounts(list)
      listContacts().then(setContacts, () => {})
      setDraft(left)
      setMessages([...chat.slice(0, -1), { role: "model", text: JSON.stringify(left) }])
      const f = toFormError(x)
      setErr({ message: f.message ?? Object.values(f.fields ?? {}).join(", ") })
    } finally {
      setBusy(false)
    }
  }

  const name = (ref: string) => {
    if (ref.startsWith("new:")) return <span className="text-primary">{ref.slice(4)} ({t("qa.ai.new")})</span>
    const known = accounts.find((a) => a.id === ref)?.name ?? contacts.find((c) => c.id === ref)?.name
    return known ?? <span className="text-amber-700">{t("qa.ai.missing")}</span>
  }
  const line = (i: DraftItem) => {
    if (i.target === "entry") return <>{name(i.from)} → {name(i.to)}</>
    const c = contacts.find((c) => c.id === i.contact)
    const owed = i.loan_type === "lunas_keluar" ? c?.payable : c?.receivable
    return <>{t(`qa.loan.${i.loan_type}` as never, { name: c?.name ?? i.contact.slice(4), amount: fmtIDR(owed ?? 0) })} · {name(i.account)}</>
  }

  return (
    <div className="grid min-h-[60svh] grid-rows-[auto_1fr_auto] gap-3">
      <Button variant="ghost" className="h-9 justify-self-start" onClick={onManual}><PenLine />{t("qa.ai.manual")}</Button>

      <div className="grid content-start gap-2 overflow-y-auto text-sm" aria-live="polite">
        <p className="text-muted-foreground">{t("qa.ai.intro")}</p>
        {messages.map((m, n) => (
          <p key={n} className={cn("max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap", m.role === "user" ? "justify-self-end bg-primary text-primary-foreground" : "bg-muted")}>
            {m.role === "user" ? m.text : (JSON.parse(m.text) as AssistantReply).reply}
          </p>
        ))}
        {busy && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("qa.ai.thinking")}</p>}
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 -mx-4 grid gap-2 border-t bg-background px-4 pt-3 pb-1">
        <Status err={err} ok="" />
        {draft && (
          <div className="grid gap-2 rounded-sm border p-3 text-sm">
            <span className="text-xs text-muted-foreground">{t("qa.ai.draft")}</span>
            {draft.items.map((i, n) => (
              <div key={n} className="grid gap-0.5">
                <span className="font-medium tabular-nums">{fmtIDR(Math.round(i.amount * 100))} · {i.description}</span>
                <span className="text-muted-foreground">{line(i)} · {i.entry_date}</span>
              </div>
            ))}
            <Button className="h-11 rounded-sm" disabled={busy || !ready(draft)} onClick={() => save(draft)}>{t("common.save")}</Button>
          </div>
        )}
        <form className="flex gap-2" onSubmit={send}>
          <Input autoFocus value={text} onInput={(e) => setText(e.currentTarget.value)} maxLength={500}
            aria-label={t("qa.ai.placeholder")} placeholder={t("qa.ai.placeholder")} className="h-11 flex-1 rounded-sm md:h-10" />
          <Button type="submit" aria-label={t("qa.ai.send")} className="h-11 rounded-sm md:h-10" disabled={busy || !text.trim()}><Send /></Button>
        </form>
      </div>
    </div>
  )
}
