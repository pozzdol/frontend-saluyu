import { useSyncExternalStore } from "preact/compat"
import { ApiError, currentUserId, postEntry, type PostEntryInput } from "@/lib/api"

// The outbox keeps Quick Add entries that could not reach the server (offline, or the
// network dropped) and sends them later. Each carries a client_id, so a send that reached
// the server but whose answer got lost is not posted twice. Entries are kept per user: a
// shared phone never posts one person's entry into another's book.
// ponytail: localStorage, fine for a few dozen entries; IndexedDB if the queue ever grows.

type Item = { user: string; entry: PostEntryInput & { client_id: string } }

const KEY = "saluyu.outbox"
const listeners = new Set<() => void>()
let snapshot = read()

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]")
  } catch {
    return []
  }
}

function write(items: Item[]) {
  snapshot = items
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* private mode: the queue lives until the tab closes */
  }
  listeners.forEach((l) => l())
}

export function enqueue(entry: PostEntryInput & { client_id: string }) {
  const user = currentUserId()
  if (user) write([...snapshot, { user, entry }])
}

// isOffline tells a network failure (fetch threw, or a proxy says the server is down) from
// an answer the server gave. Those answers are never queued: they would fail again.
export const isOffline = (e: unknown) =>
  e instanceof TypeError || !navigator.onLine || (e instanceof ApiError && e.status >= 502 && e.status <= 504)

let flushing = false

// flush sends the current user's queued entries in order. It stops at the first network
// failure; an entry the server refuses (books closed, account gone) is dropped and returned
// so the caller can say so.
export async function flush(): Promise<{ sent: number; refused: ApiError[] }> {
  const user = currentUserId()
  const out = { sent: 0, refused: [] as ApiError[] }
  if (flushing || !user || !navigator.onLine) return out
  flushing = true
  try {
    for (const item of snapshot.filter((i) => i.user === user)) {
      try {
        await postEntry(item.entry)
        out.sent++
      } catch (e) {
        if (isOffline(e) || !(e instanceof ApiError) || e.status === 401) break // offline again, or signed out
        out.refused.push(e)
      }
      write(snapshot.filter((i) => i.entry.client_id !== item.entry.client_id))
    }
  } finally {
    flushing = false
  }
  return out
}

export const useOutboxCount = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => snapshot.filter((i) => i.user === currentUserId()).length,
  )
