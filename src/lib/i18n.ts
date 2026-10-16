import { useSyncExternalStore } from "preact/compat"
import { en } from "@/i18n/en"
import { id, type Dict } from "@/i18n/id"

export type Locale = "id" | "en"

// Key is every dotted path to a string in the Indonesian dictionary, e.g. "nav.dashboard".
// A typo or a key missing from en.ts fails `tsc`.
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]
export type Key = Leaves<Dict>

const dicts: Record<Locale, Dict> = { id, en }

// A visitor's own choice (landing footer) wins; otherwise Indonesian browsers get Indonesian
// and everyone else English. A signed-in user's saved language overrides both (LocaleSync).
const guestKey = "saluyu.locale"
const guestChoice = (): Locale | null => {
  try {
    const v = localStorage.getItem(guestKey)
    return v === "id" || v === "en" ? v : null
  } catch {
    return null
  }
}
export const browserLocale = (): Locale => guestChoice() ?? (navigator.language?.toLowerCase().startsWith("id") ? "id" : "en")

// chooseLocale is the visitor picking a language: applied now and remembered on this device.
export function chooseLocale(l: Locale) {
  try {
    localStorage.setItem(guestKey, l)
  } catch {
    /* private mode: this visit only */
  }
  setLocale(l)
}

let current: Locale = browserLocale()
const listeners = new Set<() => void>()

export function setLocale(l: Locale) {
  if (l === current) return
  current = l
  document.documentElement.lang = l
  listeners.forEach((f) => f())
}

export const getLocale = () => current

export function useLocale() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => current,
  )
}

function lookup(d: unknown, key: string): string | undefined {
  let v: unknown = d
  for (const part of key.split(".")) v = (v as Record<string, unknown> | undefined)?.[part]
  return typeof v === "string" ? v : undefined
}

// t translates a key, filling {name} placeholders. It falls back to Indonesian, then the key.
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = lookup(dicts[current], key) ?? lookup(id, key) ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

// tMaybe is t for keys built at runtime (API error codes); unknown keys return undefined.
export function tMaybe(key: string, vars?: Record<string, string | number>): string | undefined {
  return lookup(dicts[current], key) ? t(key as Key, vars) : undefined
}

// useT re-renders the component when the language changes.
export function useT() {
  useLocale()
  return t
}

// intlLocale is what Intl formatters get for the current language.
export const intlLocale = () => (current === "id" ? "id-ID" : "en-GB")
