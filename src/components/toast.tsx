import { X } from "lucide-react"
import { useEffect, useSyncExternalStore } from "preact/compat"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// One toast at a time: a new one replaces the old, like a phone's snackbar.
type Toast = { id: number; text: string; tone?: "error"; action?: { label: string; run: () => void } }

let current: Toast | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(text: string, opts: Omit<Toast, "id" | "text"> = {}) {
  current = { id: ++seq, text, ...opts }
  emit()
}
export const dismiss = () => ((current = null), emit())

// Toaster sits once in the app shell. The live region always exists, so screen readers
// announce each new message.
export function Toaster() {
  const t = useT()
  const item = useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => current)

  useEffect(() => {
    if (!item) return
    const timer = window.setTimeout(() => current?.id === item.id && dismiss(), item.action ? 8000 : 4000)
    return () => window.clearTimeout(timer)
  }, [item?.id])

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 max-md:bottom-24 print:hidden">
      {item && (
        <div role={item.tone === "error" ? "alert" : "status"}
          className={cn("pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-2 rounded-sm py-1 pr-1 pl-4 text-sm text-white shadow-lg",
            item.tone === "error" ? "bg-rose-700" : "bg-neutral-900")}>
          <span className="mr-auto py-2">{item.text}</span>
          {item.action && (
            <button type="button" className="h-10 rounded-sm px-3 font-semibold text-sky-300 hover:bg-white/10"
              onClick={() => (item.action!.run(), dismiss())}>
              {item.action.label}
            </button>
          )}
          <button type="button" aria-label={t("common.close")} className="grid size-10 place-items-center rounded-sm hover:bg-white/10" onClick={dismiss}>
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
