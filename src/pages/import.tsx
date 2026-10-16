import { FileUp, Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { AppShell, MobileItem, MobileList } from "@/components/app-shell"
import { Field, SelectField, Status, accountOptions, toFormError, type FormError } from "@/components/field"
import { SelectPicker, fmtDate } from "@/components/picker"
import { toast } from "@/components/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  commitImport,
  createCategoryRule,
  deleteCategoryRule,
  isMoney,
  listAccounts,
  listCategoryRules,
  perContact,
  previewImport,
  type Account,
  type CategoryRule,
  type ImportPreview,
  type ImportRow,
  type Mapping,
  type User,
} from "@/lib/api"
import { useT, type Key } from "@/lib/i18n"
import { cn, fmtIDR } from "@/lib/utils"

const statusTone: Record<ImportRow["status"], string> = {
  new: "bg-sky-50 text-sky-700",
  matched: "bg-emerald-50 text-emerald-700",
  duplicate: "bg-muted text-muted-foreground",
}

// MappingForm lets a person fix the columns when the header words were not enough.
function MappingForm({ headers, mapping, onChange }: { headers: string[]; mapping: Mapping; onChange: (m: Mapping) => void }) {
  const t = useT()
  const cols = [{ value: "", label: "—" }, ...headers.map((h, i) => ({ value: String(i), label: h || t("imp.column", { n: i + 1 }) }))]
  const pick = (key: keyof Mapping, label: Key, value: number | null) => (
    <div className="grid gap-1 text-sm">
      <span className="font-medium">{t(label)}</span>
      <SelectPicker aria-label={t(label)} title={t(label)} value={value === null ? "" : String(value)} options={cols}
        onChange={(v) => {
          const n = v === "" ? null : Number(v)
          onChange({ ...mapping, [key]: key === "description_cols" ? (n === null ? [] : [n]) : n })
        }} />
    </div>
  )
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {pick("date_col", "imp.dateCol", mapping.date_col)}
      {pick("description_cols", "imp.descCol", mapping.description_cols[0] ?? null)}
      {pick("amount_col", "imp.amountCol", mapping.amount_col)}
      {pick("debit_col", "imp.debitCol", mapping.debit_col)}
      {pick("credit_col", "imp.creditCol", mapping.credit_col)}
      <div className="grid gap-1 text-sm">
        <span className="font-medium">{t("imp.dateFormat")}</span>
        <SelectPicker aria-label={t("imp.dateFormat")} title={t("imp.dateFormat")} value={mapping.date_format}
          onChange={(v) => onChange({ ...mapping, date_format: v as Mapping["date_format"] })}
          options={[{ value: "dmy", label: "31/12/2026" }, { value: "mdy", label: "12/31/2026" }, { value: "ymd", label: "2026-12-31" }]} />
      </div>
      <div className="grid gap-1 text-sm">
        <span className="font-medium">{t("imp.decimal")}</span>
        <SelectPicker aria-label={t("imp.decimal")} title={t("imp.decimal")} value={mapping.decimal}
          onChange={(v) => onChange({ ...mapping, decimal: v as Mapping["decimal"] })}
          options={[{ value: "comma", label: "1.234.567,89" }, { value: "dot", label: "1,234,567.89" }]} />
      </div>
      <label className="flex items-center gap-2 self-end text-sm">
        <Checkbox checked={mapping.negate} onCheckedChange={(v) => onChange({ ...mapping, negate: v === true })} />
        {t("imp.negate")}
      </label>
    </div>
  )
}

function Rules({ accounts }: { accounts: Account[] }) {
  const t = useT()
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [keyword, setKeyword] = useState("")
  const [account, setAccount] = useState("")
  const [err, setErr] = useState<FormError>({})
  const categories = accounts.filter((a) => a.is_active && (a.type === "Expense" || a.type === "Revenue"))
  useEffect(() => {
    listCategoryRules().then(setRules, (e) => setErr(toFormError(e)))
  }, [])
  async function add(e: SubmitEvent) {
    e.preventDefault()
    setErr({})
    // The category is chosen on purpose: a silent first option once filed GRAB under Gaji.
    if (!account) return setErr({ fields: { account: t("field.choose") } })
    try {
      const r = await createCategoryRule({ keyword, account_id: account, min_amount: null, max_amount: null })
      setRules([...rules, r])
      setKeyword("")
      setAccount("")
      toast(t("imp.ruleAdded", { keyword: r.keyword, account: accounts.find((a) => a.id === r.account_id)?.name ?? "" }))
    } catch (x) {
      setErr(toFormError(x))
    }
  }
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">{t("imp.rules")}</h2>
      <p className="text-sm text-muted-foreground">{t("imp.rulesHint")}</p>
      <Status err={err} ok="" />
      <form onSubmit={add} noValidate className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field name="keyword" label={t("imp.keyword")} placeholder="GRAB" value={keyword} onInput={(e) => setKeyword((e.currentTarget as HTMLInputElement).value)} error={err.fields?.keyword} />
        <SelectField name="account" label={t("imp.goesTo")} value={account} onChange={setAccount} options={accountOptions(categories)} error={err.fields?.account} mustChoose />
        <Button type="submit" variant="outline" className="h-10 rounded-sm" disabled={!keyword.trim()}><Plus /> {t("common.add")}</Button>
      </form>
      {rules.length > 0 && (
        <ul className="divide-y rounded-sm border bg-card text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2">
              <span className="font-mono">{r.keyword}</span>
              <span className="text-muted-foreground">→</span>
              <span className="mr-auto">{accounts.find((a) => a.id === r.account_id)?.name}</span>
              <Button variant="ghost" size="icon-sm" aria-label={t("imp.deleteRule", { keyword: r.keyword })}
                title={t("imp.deleteRule", { keyword: r.keyword })}
                onClick={() => deleteCategoryRule(r.id).then(() => {
                  setRules((list) => list.filter((x) => x.id !== r.id))
                  toast(t("imp.ruleDeleted", { keyword: r.keyword }), {
                    action: { label: t("common.undo"), run: () => createCategoryRule({ keyword: r.keyword, account_id: r.account_id, min_amount: r.min_amount, max_amount: r.max_amount }).then((n) => setRules((list) => [...list, n]), (e) => setErr(toFormError(e))) },
                  })
                }, (e) => setErr(toFormError(e)))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ImportPage({ user }: { user: User }) {
  const t = useT()
  const [fileKey, setFileKey] = useState(0) // a fresh <input type=file> after each import
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [choice, setChoice] = useState<Record<string, { include: boolean; account?: string }>>({})
  const [showMapping, setShowMapping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})

  useEffect(() => {
    listAccounts().then((list) => {
      setAccounts(list)
      setAccountId(list.find((a) => a.is_active && isMoney(a))?.id ?? "")
    }, (e) => setErr(toFormError(e)))
  }, [])

  const money = accounts.filter((a) => a.is_active && isMoney(a))
  const active = accounts.filter((a) => a.is_active && !perContact(a.code) && a.id !== accountId)
  const outOptions = accountOptions(active.filter((a) => a.type === "Expense" || a.type === "Asset" || a.type === "Liability"))
  const inOptions = accountOptions(active.filter((a) => a.type === "Revenue" || a.type === "Asset" || a.type === "Liability"))
  // Rows before the books start would make the whole import fail: mark and skip them up front.
  const early = (r: ImportRow) => !!user.start_date && r.date < user.start_date
  const skipped = (r: ImportRow) => r.status === "duplicate" || early(r)
  const fallback = (r: ImportRow) => accounts.find((a) => a.code === (r.amount < 0 ? "5199" : "4199"))?.id ?? ""

  async function load(mapping?: Mapping) {
    if (!file || !accountId) return
    setBusy(true)
    setErr({})
    try {
      const p = await previewImport(accountId, file, mapping)
      setPreview(p)
      setChoice(Object.fromEntries(p.rows.map((r) => [r.hash, { include: !skipped(r), account: r.suggested_account_id ?? undefined }])))
    } catch (e) {
      setErr(toFormError(e))
      setShowMapping(true)
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    if (!preview) return
    setBusy(true)
    setErr({})
    try {
      const rows = preview.rows.filter((r) => choice[r.hash]?.include && !skipped(r)).map((r) => ({
        hash: r.hash, date: r.date, description: r.description, amount: r.amount,
        ...(r.status === "matched" ? { match_entry_id: r.entry_id! } : { account_id: choice[r.hash]?.account || fallback(r) }),
      }))
      const res = await commitImport({ account_id: accountId, mapping: preview.mapping, rows })
      toast(t("imp.done", { posted: res.posted, matched: res.matched }))
      setPreview(null)
      setFile(null)
      setFileKey((k) => k + 1)
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  const count = preview?.rows.filter((r) => choice[r.hash]?.include && !skipped(r)).length ?? 0
  const earlyCount = preview?.rows.filter(early).length ?? 0
  const set = (hash: string, patch: { include?: boolean; account?: string }) => setChoice((c) => ({ ...c, [hash]: { ...c[hash], ...patch } }))

  return (
    <AppShell title={t("nav.import")}>
      {/* minmax(0,1fr): long descriptions and pickers in the preview must not widen the page */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("imp.intro")}</p>
        <Card className="rounded-sm">
          <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <SelectField name="account" label={t("imp.account")} value={accountId} onChange={(v) => (setAccountId(v), setPreview(null))} options={accountOptions(money)} />
            {/* Our own button and file name: the browser's own control speaks the browser's language. */}
            <label className="grid min-w-0 gap-1.5 text-sm">
              <span className="font-medium">{t("imp.file")}</span>
              <span className="flex h-11 min-w-0 items-center gap-3 rounded-sm border bg-background px-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 md:h-10">
                <input key={fileKey} type="file" accept=".csv,.xlsx,text/csv" className="sr-only"
                  onChange={(e) => (setFile(e.currentTarget.files?.[0] ?? null), setPreview(null))} />
                <span className="shrink-0 rounded-sm bg-[#eaf2ff] px-3 py-1 font-medium text-primary">{t("imp.chooseFile")}</span>
                <span className={cn("min-w-0 truncate", !file && "text-muted-foreground")}>{file?.name ?? t("imp.noFile")}</span>
              </span>
            </label>
            <Button className="h-10 rounded-sm" disabled={!file || !accountId || busy} onClick={() => load()}>
              {busy ? <Loader2 className="animate-spin" /> : <FileUp />} {t("imp.read")}
            </Button>
          </CardContent>
        </Card>
        <Status err={err} ok="" />

        {preview && (
          <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t("imp.preview", { n: preview.rows.length })}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowMapping(!showMapping)}>{t("imp.fixColumns")}</Button>
            </div>
            {showMapping && (
              <Card className="rounded-sm"><CardContent className="grid gap-3">
                <MappingForm headers={preview.headers} mapping={preview.mapping} onChange={(m) => setPreview({ ...preview, mapping: m })} />
                <Button variant="outline" className="justify-self-start rounded-sm" disabled={busy} onClick={() => load(preview.mapping)}>{t("imp.reread")}</Button>
              </CardContent></Card>
            )}
            {earlyCount > 0 && user.start_date && (
              <p className="text-sm text-amber-800">{t("imp.earlyNote", { n: earlyCount, date: fmtDate(user.start_date) })}</p>
            )}
            {preview.errors.length > 0 && (
              <p className="text-sm text-amber-800">{t("imp.lineErrors", { n: preview.errors.length, lines: preview.errors.slice(0, 5).map((e) => e.line).join(", ") })}</p>
            )}
            <MobileList empty={preview.rows.length === 0 ? t("imp.empty") : undefined} className="md:block">
              {preview.rows.map((r) => {
                const c = choice[r.hash] ?? { include: false }
                const off = skipped(r)
                return (
                  <MobileItem key={r.hash}
                    lead={<Checkbox aria-label={t("imp.include", { line: r.line })} checked={c.include && !off} disabled={off}
                      onCheckedChange={(v) => set(r.hash, { include: v === true })} />}
                    title={<span className={cn(!c.include && "text-muted-foreground")}>{r.description || "—"}</span>}
                    meta={<>
                      <span>{fmtDate(r.date)}</span>
                      {early(r) ? (
                        <Badge className="rounded-sm bg-amber-50 text-amber-800">{t("imp.early")}</Badge>
                      ) : (
                        <Badge className={cn("rounded-sm", statusTone[r.status])}>{t(`imp.status.${r.status}` as Key)}</Badge>
                      )}
                      {r.status === "new" && c.include && !off && (
                        <span className="w-full max-w-72" onClick={(e) => e.preventDefault()}>
                          <SelectPicker aria-label={t("imp.categoryFor", { line: r.line })} title={t("tx.category")} value={c.account || fallback(r)}
                            options={r.amount < 0 ? outOptions : inOptions} onChange={(v) => set(r.hash, { account: v })} className="h-9 text-sm" />
                        </span>
                      )}
                    </>}
                    value={`${r.amount < 0 ? "−" : "+"} ${fmtIDR(Math.abs(r.amount))}`}
                    valueClass={r.amount < 0 ? "text-rose-700" : "text-emerald-700"} />
                )
              })}
            </MobileList>
            <Button className="h-11 justify-self-start rounded-sm px-8" disabled={busy || count === 0} onClick={commit}>
              {busy && <Loader2 className="animate-spin" />}
              {t("imp.commit", { n: count })}
            </Button>
          </section>
        )}

        <Rules accounts={accounts} />
      </div>
    </AppShell>
  )
}
