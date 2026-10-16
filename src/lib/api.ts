import { useSyncExternalStore } from "preact/compat"

export type User = {
  id: string
  name: string
  email: string
  img_url: string
  is_active: boolean
}

type Session = { access_token: string; user: User }

export class ApiError extends Error {
  status: number
  fields?: Record<string, string>

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
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
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText, body.fields)
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

export async function login(body: { email: string; password: string }) {
  setSession(await request<Session>("/login", json("POST", body)))
}

export async function logout() {
  try {
    await request("/auth/logout", { method: "POST" })
  } finally {
    setSession(null)
  }
}

export async function updateProfile(body: { name?: string; img_url?: string }) {
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
}

export type EntryKind = "income" | "expense" | "transfer" | "loan" | "repayment" | "opening" | "cash_count" | "adjustment"

export type Line = { account_id: string; code: string; name: string; debit: number; credit: number }

export type Entry = {
  id: string
  entry_no: number
  entry_date: string
  kind: EntryKind
  description: string
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

export const createAccount = (body: { code: string; name: string; type: AccountType; category: string }) =>
  authed<{ data: Account }>("/accounts", json("POST", body)).then((r) => r.data)

export const updateAccount = (id: string, body: { name?: string; category?: string; is_active?: boolean }) =>
  authed<{ data: Account }>(`/accounts/${id}`, json("PATCH", body)).then((r) => r.data)

export type PostEntryInput = {
  kind: "income" | "expense" | "transfer"
  entry_date: string
  amount: number
  from_account_id: string
  to_account_id: string
  description: string
}

export const postEntry = (body: PostEntryInput) =>
  authed<{ data: Entry }>("/entries", json("POST", body)).then((r) => r.data)

export type EntryQuery = { from?: string; to?: string; kind?: string; account_id?: string; q?: string; page?: number; limit?: number }

export const listEntries = (params: EntryQuery) =>
  authed<{ data: Entry[]; total: number; page: number; limit: number }>(`/entries${query(params)}`)

export const deleteEntry = (id: string) => authed<void>(`/entries/${id}`, { method: "DELETE" })

export const getLedger = (id: string, params: { from?: string; to?: string }) =>
  authed<{ data: Ledger }>(`/accounts/${id}/ledger${query(params)}`).then((r) => r.data)

export const getTrialBalance = (asOf: string) =>
  authed<{ data: TrialBalance }>(`/reports/trial-balance${query({ as_of: asOf })}`).then((r) => r.data)
