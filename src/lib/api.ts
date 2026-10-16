import { useSyncExternalStore } from "preact/compat"

export type User = {
  id: string
  name: string
  email: string
  img_url: string
  is_active: boolean
  start_date: string | null // null until the opening balance is set
  locale: "id" | "en" | null // null = follow the browser
  period_start_day: number // 1..28, first day of the payday period
  email_verified: boolean // group invites show only after verifying
  totp_enabled: boolean
}

type Session = { access_token: string; user: User }

export class ApiError extends Error {
  status: number
  code?: string // stable error code the UI translates, e.g. "email_taken"
  fields?: Record<string, string> // English text per field (fallback)
  fieldCodes?: Record<string, string> // e.g. {"name": "min_len:3"}

  constructor(status: number, message: string, fields?: Record<string, string>, code?: string, fieldCodes?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
    this.code = code
    this.fieldCodes = fieldCodes
  }
}

// The access token lives only in memory: an XSS bug cannot read it from storage, and it dies
// with the tab. The refresh token is an HttpOnly cookie the browser sends to /api/v1/auth/*,
// so after a reload the session is restored by calling refresh().
let accessToken: string | null = null
let state: { user: User | null; ready: boolean } = { user: null, ready: false }
const listeners = new Set<() => void>()

function setUser(user: User | null) {
  state = { user, ready: true }
  listeners.forEach((l) => l())
}

function setSession(s: Session | null) {
  accessToken = s?.access_token ?? null
  setUser(s?.user ?? null)
}

export function useAuth() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
  })
  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText, body.fields, body.code, body.field_codes)
  return body as T
}

// Each refresh token works once (rotation), so two tabs must not refresh at the same time.
// The Web Locks API queues them across tabs; the waiting tab then sends the cookie the
// first one received, instead of the used one that would look like theft and end every session.
let inflight: Promise<boolean> | null = null

export function refresh(): Promise<boolean> {
  inflight ??= navigator.locks
    .request("saluyu-refresh", async () => {
      try {
        setSession(await request<Session>("/auth/refresh", { method: "POST" }))
        return true
      } catch {
        setSession(null)
        return false
      }
    })
    .finally(() => (inflight = null))
  return inflight
}

// authed retries once after a refresh when the short-lived access token has expired.
async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(path, init)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await refresh())) return request<T>(path, init)
    throw e
  }
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export async function register(body: { name: string; email: string; password: string }) {
  await request("/register", json("POST", body))
}

// login returns an mfa ticket when the account has 2FA; loginTOTP finishes with the code.
export async function login(body: { email: string; password: string }): Promise<{ mfaToken?: string }> {
  const res = await request<Session | { mfa_required: true; mfa_token: string }>("/login", json("POST", body))
  if ("mfa_required" in res) return { mfaToken: res.mfa_token }
  setSession(res)
  return {}
}

export async function loginTOTP(body: { mfa_token: string; code: string }) {
  setSession(await request<Session>("/login/totp", json("POST", body)))
}

export const forgotPassword = (email: string) => request<void>("/password/forgot", json("POST", { email }))
export const resetPassword = (body: { token: string; new_password: string }) => request<void>("/password/reset", json("POST", body))
export async function verifyEmail(token: string) {
  await request<void>("/email/verify", json("POST", { token }))
  if (state.user) setUser({ ...state.user, email_verified: true })
}
export const resendVerification = () => authed<void>("/me/email/verification", { method: "POST" })

export type SessionInfo = { id: string; user_agent: string; started_at: string; last_active: string; current: boolean }
export const listSessions = () => authed<{ data: SessionInfo[] }>("/auth/sessions").then((r) => r.data)
export const endSession = (id: string) => authed<void>(`/auth/sessions/${id}`, { method: "DELETE" })
// Older access tokens stop working, this tab included, so it switches to the new one.
export async function revokeOtherSessions() {
  const res = await authed<{ access_token: string }>("/auth/sessions/revoke-others", { method: "POST" })
  accessToken = res.access_token
}

export const setupTOTP = () => authed<{ data: { secret: string; uri: string } }>("/me/totp/setup", { method: "POST" }).then((r) => r.data)
export async function enableTOTP(code: string) {
  const res = await authed<{ backup_codes: string[] }>("/me/totp/enable", json("POST", { code }))
  if (state.user) setUser({ ...state.user, totp_enabled: true })
  return res.backup_codes
}
export async function disableTOTP(body: { password: string; code: string }) {
  await authed<void>("/me/totp/disable", json("POST", body))
  if (state.user) setUser({ ...state.user, totp_enabled: false })
}

// downloadExport saves the ZIP of all data; the bearer token rules out a plain link.
export async function downloadExport() {
  const go = () => fetch("/api/v1/me/export", { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
  let res = await go()
  if (res.status === 401 && (await refresh())) res = await go()
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? res.statusText, undefined, body.code)
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "saluyu.zip"
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement("a"), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function logout() {
  try {
    await request("/auth/logout", { method: "POST" })
  } finally {
    setSession(null)
  }
}

export async function updateProfile(body: { name?: string; img_url?: string; period_start_day?: number; locale?: "id" | "en" | "auto" }) {
  const res = await authed<{ data: User }>("/me", json("PATCH", body))
  setUser(res.data)
}

export async function changePassword(body: { old_password: string; new_password: string }) {
  // Every other device is now logged out; this tab continues with the new access token.
  const res = await authed<{ access_token: string }>("/me/password", json("PUT", body))
  accessToken = res.access_token
}

// ---- Ledger (phase 1) ----

export type AccountType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense"

export type Account = {
  id: string
  code: string
  name: string
  type: AccountType
  category: string
  normal_balance: "Debit" | "Credit"
  is_active: boolean
  icon: string // "" = default for the type
  color: string
  uses_30d: number // entries in the last 30 days; Quick Add sorts categories by it
  kind: "general" | "credit_card" | "paylater" | "loan"
}

// isCard: a credit card or paylater pays for things like a bank account, and runs up a bill.
export const isCard = (a: Account) => a.kind === "credit_card" || a.kind === "paylater"
// isMoney: what pays for an expense or starts a transfer.
export const isMoney = (a: Account) => (a.type === "Asset" || isCard(a)) && !perContact(a.code)

export type EntryKind = "income" | "expense" | "transfer" | "loan" | "repayment" | "opening" | "cash_count" | "adjustment" | "borrowing" | "installment"

export type Line = {
  account_id: string
  code: string
  name: string
  debit: number
  credit: number
  contact_id: string | null // set only on 1101 Piutang / 2101 Utang lines
  contact_name?: string
}

export type Entry = {
  id: string
  entry_no: number
  entry_date: string
  kind: EntryKind
  description: string
  period_date: string | null // set when counted toward another period than entry_date
  created_at: string
  lines: Line[]
}

export type LedgerRow = {
  entry_id: string
  entry_no: number
  entry_date: string
  kind: EntryKind
  description: string
  counter: string
  debit: number
  credit: number
  balance: number
}

export type Ledger = { account: Account; opening: number; rows: LedgerRow[]; closing: number }

export type TrialBalanceRow = {
  account_id: string
  code: string
  name: string
  type: AccountType
  debit: number
  credit: number
  debit_balance: number
  credit_balance: number
}

export type TrialBalance = {
  as_of: string
  rows: TrialBalanceRow[]
  total_debit: number
  total_credit: number
  balanced: boolean
}

// query builds "?a=1&b=2" from the non-empty values only.
function query(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ""
}

export const listAccounts = () => authed<{ data: Account[] }>("/accounts").then((r) => r.data)

export const createAccount = (body: { code: string; name: string; type: AccountType; category: string; icon?: string; color?: string }) =>
  authed<{ data: Account }>("/accounts", json("POST", body)).then((r) => r.data)

export const updateAccount = (id: string, body: { name?: string; category?: string; is_active?: boolean; icon?: string; color?: string }) =>
  authed<{ data: Account }>(`/accounts/${id}`, json("PATCH", body)).then((r) => r.data)

export type PostEntryInput = {
  kind: "income" | "expense" | "transfer"
  entry_date: string
  amount: number
  from_account_id: string
  to_account_id: string
  description: string
  next_period?: boolean
  fee?: number // transfers only: a bank charge paid from the same source
  fee_account_id?: string
}

export const postEntry = (body: PostEntryInput) =>
  authed<{ data: Entry }>("/entries", json("POST", body)).then((r) => (entriesChanged(), r.data))

export type EntryQuery = { from?: string; to?: string; kind?: string; account_id?: string; q?: string; page?: number; limit?: number }

export const listEntries = (params: EntryQuery) =>
  authed<{ data: Entry[]; total: number; page: number; limit: number }>(`/entries${query(params)}`)

export const deleteEntry = (id: string, keepalive = false) =>
  authed<void>(`/entries/${id}`, { method: "DELETE", keepalive }).then(entriesChanged)

// deleteSoon hides an entry now and deletes it after 8 seconds, so the toast can undo it.
// Leaving the page sends every waiting delete at once (keepalive survives the unload).
const doomed = new Map<string, number>()
let hiddenEntries: ReadonlySet<string> = new Set()
const hiddenListeners = new Set<() => void>()
const setHidden = () => ((hiddenEntries = new Set(doomed.keys())), hiddenListeners.forEach((l) => l()))
export const useHiddenEntries = () =>
  useSyncExternalStore((l) => (hiddenListeners.add(l), () => void hiddenListeners.delete(l)), () => hiddenEntries)

export function deleteSoon(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    doomed.set(id, window.setTimeout(() => {
      doomed.delete(id)
      deleteEntry(id).then(resolve, reject).finally(setHidden)
    }, 8000))
    setHidden()
  })
}
export function undoDelete(id: string) {
  window.clearTimeout(doomed.get(id))
  doomed.delete(id)
  setHidden()
}
window.addEventListener("pagehide", () => {
  for (const [id, timer] of doomed) (window.clearTimeout(timer), void deleteEntry(id, true).catch(() => {}))
  doomed.clear()
})

export type Revision = { changed_at: string; changed_by: string; before: Snapshot; after: Snapshot }
export type Snapshot = { entry_date: string; period_date: string | null; description: string; lines: Line[] }
export type EntryDetail = {
  entry: Entry
  revisions: Revision[] | null
  loan_status: "" | "pending" | "approved" | "rejected"
  mirrored: boolean
  change_pending: boolean
}
export const getEntry = (id: string) => authed<{ data: EntryDetail }>(`/entries/${id}`).then((r) => r.data)

// An edit answers 202 when another member must approve it first.
type Edited = { data: Entry; status?: "pending_approval" }
const edited = (r: Edited) => (entriesChanged(), { entry: r.data, pending: r.status === "pending_approval" })
export const editEntry = (id: string, body: PostEntryInput) => authed<Edited>(`/entries/${id}`, json("PUT", body)).then(edited)
export const editLoan = (id: string, body: LoanInput) => authed<Edited>(`/loans/${id}`, json("PUT", body)).then(edited)
export type LineInput = { account_id: string; contact_id: string | null; debit: number; credit: number }
export const editLines = (id: string, body: { entry_date: string; description: string; lines: LineInput[] }) =>
  authed<Edited>(`/entries/${id}/lines`, json("PUT", body)).then(edited)

// entriesVersion bumps after every post or delete, so a page open behind Quick Add reloads.
let entriesVersion = 0
const entriesListeners = new Set<() => void>()
export const entriesChanged = () => (entriesVersion++, entriesListeners.forEach((l) => l()))
export const useEntriesVersion = () =>
  useSyncExternalStore((l) => (entriesListeners.add(l), () => void entriesListeners.delete(l)), () => entriesVersion)

export const getLedger = (id: string, params: { from?: string; to?: string }) =>
  authed<{ data: Ledger }>(`/accounts/${id}/ledger${query(params)}`).then((r) => r.data)

export const getTrialBalance = (asOf: string) =>
  authed<{ data: TrialBalance }>(`/reports/trial-balance${query({ as_of: asOf })}`).then((r) => r.data)

// ---- Opening balance & reconciliation (phase 2) ----

export type Opening = { start_date: string | null; entry: Entry | null; editable: boolean }

export const getOpening = () => authed<{ data: Opening }>("/opening").then((r) => r.data)

export type OpeningItem = { account_id: string; contact_id?: string; amount: number }

export async function setOpening(body: { start_date: string; items: OpeningItem[] }) {
  const o = await authed<{ data: Opening }>("/opening", json("PUT", body)).then((r) => r.data)
  if (state.user) setUser({ ...state.user, start_date: o.start_date }) // unlocks the console
  return o
}

export const getBalance = (accountId: string, date: string) =>
  authed<{ data: { balance: number } }>(`/accounts/${accountId}/balance${query({ date })}`).then((r) => r.data.balance)

export type ReconcileInput = { account_id: string; date: string; actual: number; counter_account_id?: string }
export type ReconcileResult = { book: number; actual: number; diff: number; entry: Entry | null }

export const cashCount = (body: ReconcileInput) =>
  authed<{ data: ReconcileResult }>("/cash-counts", json("POST", body)).then((r) => r.data)

export const reconcile = (body: ReconcileInput) =>
  authed<{ data: ReconcileResult }>("/reconciliations", json("POST", body)).then((r) => r.data)

// ---- Periods, budgets & reports (phase 3) ----

export type Period = { start: string; end: string; next: string; prev: string; label: string }
export type AmountRow = { account_id: string; code: string; name: string; amount: number }
export type BudgetRow = { account_id: string; name: string; budget: number; actual: number; remaining: number; over: boolean; inherited: boolean }
export type BalanceRow = { account_id: string; code: string; name: string; category: string; balance: number }

export type Dashboard = {
  period: Period
  income: number
  expense: number
  surplus: number
  savings_rate: number // 0..1
  to_savings: AmountRow[]
  to_savings_total: number
  budgets: BudgetRow[]
  balances: BalanceRow[]
}

export type BudgetList = { period: Period; rows: BudgetRow[] }

export type IncomeStatement = {
  period: Period
  revenue: AmountRow[]
  revenue_total: number
  expense: AmountRow[]
  expense_total: number
  net_income: number
}

export type BalanceSheet = {
  as_of: string
  assets: AmountRow[]
  assets_total: number
  liabilities: AmountRow[]
  liabilities_total: number
  equity: AmountRow[]
  equity_total: number
  current_earnings: number
  balanced: boolean
}

export const getDashboard = (date: string) => authed<{ data: Dashboard }>(`/dashboard${query({ date })}`).then((r) => r.data)

export const getBudgets = (date: string) => authed<{ data: BudgetList }>(`/budgets${query({ date })}`).then((r) => r.data)

export const putBudget = (accountId: string, body: { date: string; amount: number }) =>
  authed<{ data: BudgetRow }>(`/budgets/${accountId}`, json("PUT", body)).then((r) => r.data)

export const getIncomeStatement = (date: string) =>
  authed<{ data: IncomeStatement }>(`/reports/income-statement${query({ date })}`).then((r) => r.data)

export const getBalanceSheet = (date: string) =>
  authed<{ data: BalanceSheet }>(`/reports/balance-sheet${query({ date })}`).then((r) => r.data)

// ---- Contacts & loans (phase 4) ----

// Receivables (1101) and payables (2101) are per person, so the simple forms never use them.
export const perContact = (code: string) => code === "1101" || code === "2101"

export type Contact = {
  id: string
  name: string
  linked_user_id: string | null
  receivable: number // they owe me
  payable: number // I owe them
  net: number // receivable - payable; positive = they owe me
}

export type ContactLine = {
  entry_id: string
  entry_no: number
  entry_date: string
  kind: EntryKind
  description: string
  account_code: string
  debit: number
  credit: number
  running_net: number
}

export type ContactDetail = { contact: Contact; history: ContactLine[] }

export type LoanType = "talangan" | "pinjam" | "lunas_masuk" | "lunas_keluar"

export type LoanInput = {
  type: LoanType
  contact_id: string
  account_id: string
  amount: number
  entry_date: string
  description: string
  my_share?: number
  expense_account_id?: string
  confirm_overpay?: boolean
}

export const listContacts = () => authed<{ data: Contact[] }>("/contacts").then((r) => r.data)
export const createContact = (name: string) => authed<{ data: Contact }>("/contacts", json("POST", { name })).then((r) => r.data)
export const renameContact = (id: string, name: string) =>
  authed<{ data: Contact }>(`/contacts/${id}`, json("PATCH", { name })).then((r) => r.data)
export const deleteContact = (id: string) => authed<void>(`/contacts/${id}`, { method: "DELETE" })
export const getContact = (id: string) => authed<{ data: ContactDetail }>(`/contacts/${id}`).then((r) => r.data)
export const postLoan = (body: LoanInput) => authed<{ data: Entry }>("/loans", json("POST", body)).then((r) => r.data)

// ---- Sharing groups (phase 5) ----

export type Member = { id: string; name: string; email: string; img_url: string }
export type PendingInvite = { id: string; email: string; created_at: string }
export type Group = { id: string; name: string; members: Member[]; pending_invites: PendingInvite[] }

// MemberSummary is all another member can see: one payday period's totals, never transactions.
export type MemberSummary = {
  member: Member
  period: Period
  income: number
  expense: number
  surplus: number
  savings_rate: number
  to_savings: number
  budget: number
  budget_actual: number
  assets: number
}

export type InboxInvite = { id: string; group_id: string; group_name: string; invited_by_name: string; created_at: string }
// delta: change in what I owe the sender; positive = I owe more, negative = they owe me more.
export type InboxLoan = { id: string; from_name: string; kind: EntryKind; amount: number; delta: number; entry_date: string; created_at: string }
export type InboxChange = {
  id: string
  from_name: string
  before: { amount: number; entry_date: string }
  after: { amount: number; entry_date: string }
  created_at: string
}
export type Inbox = { invites: InboxInvite[]; loans: InboxLoan[]; changes: InboxChange[] }
export const approveChange = (id: string) =>
  authed<void>(`/loan-change-requests/${id}/approve`, { method: "POST" }).then(entriesChanged)
export const rejectChange = (id: string) => authed<void>(`/loan-change-requests/${id}/reject`, { method: "POST" })

export const listGroups = () => authed<{ data: Group[] }>("/groups").then((r) => r.data)
export const createGroup = (name: string) => authed<{ data: Group }>("/groups", json("POST", { name })).then((r) => r.data)
export const inviteToGroup = (groupId: string, email: string) =>
  authed<{ data: PendingInvite }>(`/groups/${groupId}/invites`, json("POST", { email })).then((r) => r.data)
export const cancelInvite = (groupId: string, inviteId: string) =>
  authed<void>(`/groups/${groupId}/invites/${inviteId}`, { method: "DELETE" })
export const leaveGroup = (groupId: string) => authed<void>(`/groups/${groupId}/leave`, { method: "POST" })
export const groupSummary = (groupId: string, date: string) =>
  authed<{ data: MemberSummary[] }>(`/groups/${groupId}/summary${query({ date })}`).then((r) => r.data)
export const getInbox = () => authed<{ data: Inbox }>("/inbox").then((r) => r.data)
export const respondInvite = (inviteId: string, accept: boolean) =>
  authed<void>(`/invites/${inviteId}/${accept ? "accept" : "reject"}`, { method: "POST" })
export const linkContact = (contactId: string, userId: string | null) =>
  authed<{ data: Contact }>(`/contacts/${contactId}/link`, json("PUT", { user_id: userId })).then((r) => r.data)
export const approveLoan = (requestId: string, accountId: string) =>
  authed<{ data: { to_entry_id: string } }>(`/loan-requests/${requestId}/approve`, json("POST", { account_id: accountId })).then((r) => r.data)
export const rejectLoan = (requestId: string) => authed<void>(`/loan-requests/${requestId}/reject`, { method: "POST" })

// useInboxCount polls the inbox every 30 seconds while the tab is visible, for the nav badge.
// ponytail: polling, not websockets; a family-sized app does not need push.
let inboxCount = 0
const inboxListeners = new Set<() => void>()
let inboxTimer: number | undefined

export function refreshInbox() {
  if (!accessToken || document.hidden) return
  getInbox()
    .then((i) => {
      inboxCount = i.invites.length + i.loans.length + (i.changes?.length ?? 0)
      inboxListeners.forEach((l) => l())
    })
    .catch(() => {})
}

export function useInboxCount() {
  return useSyncExternalStore(
    (l) => {
      inboxListeners.add(l)
      if (inboxListeners.size === 1) {
        refreshInbox()
        inboxTimer = window.setInterval(refreshInbox, 30_000)
        document.addEventListener("visibilitychange", refreshInbox)
      }
      return () => {
        inboxListeners.delete(l)
        if (inboxListeners.size === 0) {
          window.clearInterval(inboxTimer)
          document.removeEventListener("visibilitychange", refreshInbox)
        }
      }
    },
    () => inboxCount,
  )
}

// ---- Cards and installments (phase 8) ----

export type CardSettings = { statement_day: number; due_day: number; credit_limit: number; min_payment_pct: number }
export type Card = CardSettings & { account: Account }
export type CardLine = LedgerRow
export type Statement = {
  start: string
  end: string
  due_date: string
  opening: number
  charges: number
  payments: number
  total: number
  minimum: number
  paid_since: number
  remaining: number
  min_remaining: number
  status: "paid" | "due" | "min_paid" | "overdue"
  lines?: CardLine[]
}
export type CardSummary = Card & {
  owed: number
  available: number | null
  last: Statement
  current: { start: string; end: string; charges: number; payments: number; lines?: CardLine[] }
}

export const listCards = () => authed<{ data: CardSummary[] }>("/cards").then((r) => r.data)
export const getCard = (id: string) => authed<{ data: CardSummary }>(`/cards/${id}`).then((r) => r.data)
export const createCard = (body: CardSettings & { name: string; kind: "credit_card" | "paylater" }) =>
  authed<{ data: CardSummary }>("/cards", json("POST", body)).then((r) => r.data)
export const updateCard = (id: string, body: CardSettings) =>
  authed<{ data: CardSummary }>(`/cards/${id}`, json("PATCH", body)).then((r) => r.data)

export type ScheduleRow = { seq: number; due_date: string; principal: number; interest: number; payment: number; remaining: number }
export type Plan = {
  id: string
  account: Account
  interest_account_id: string
  principal: number
  annual_rate_bp: number
  tenor_months: number
  method: "flat" | "annuity"
  first_due_date: string
  paid_count: number
  remaining: number
  total_interest: number
  next: ScheduleRow | null
  rows?: (ScheduleRow & { paid: { seq: number; entry_id: string; entry_no: number } | null })[]
}
export type PlanInput = {
  name: string
  principal: number
  annual_rate: number
  tenor_months: number
  method: "flat" | "annuity"
  first_due_date: string
  received_into_id?: string
  entry_date?: string
}

export const listPlans = () => authed<{ data: Plan[] }>("/installments").then((r) => r.data)
export const getPlan = (id: string) => authed<{ data: Plan }>(`/installments/${id}`).then((r) => r.data)
export const createPlan = (body: PlanInput) => authed<{ data: Plan }>("/installments", json("POST", body)).then((r) => (entriesChanged(), r.data))
export const payInstallment = (id: string, body: { from_account_id: string; entry_date: string }) =>
  authed<{ data: Plan }>(`/installments/${id}/pay`, json("POST", body)).then((r) => (entriesChanged(), r.data))
export const deletePlan = (id: string) => authed<void>(`/installments/${id}`, { method: "DELETE" })
