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
