// The Quick Add keypad types whole rupiah as a string of digits.
export type Key = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "000" | "back"

const maxDigits = 13 // Rp 9.999.999.999.999, far below the int64 sen limit

export function press(digits: string, key: Key): string {
  if (key === "back") return digits.slice(0, -1)
  const next = (digits + key).replace(/^0+/, "")
  return next.length > maxDigits ? digits : next
}

// Shown as "25.000"; "" stays "0".
export const show = (digits: string) => Number(digits || 0).toLocaleString("id-ID")

export const toSenDigits = (digits: string) => Number(digits || 0) * 100
