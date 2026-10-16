import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 2 })

// Money travels as integer sen (1/100 rupiah) so cents never pick up float error.
export const fmtIDR = (sen: number) => idr.format(sen / 100)

// toSen reads what a person types: "25000", "25.000" or "10826012,92" (Indonesian style),
// or "10826012.92". A dot followed by exactly 3 digits is a thousands separator.
export function toSen(input: string): number {
  let s = input.trim().replace(/\s|rp/gi, "")
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".")
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "")
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

// todayISO is the user's local calendar date, not the UTC one.
export function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}
