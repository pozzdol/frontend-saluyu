import type { ComponentChildren } from "preact"
import { cn } from "@/lib/utils"

type Item<T extends string> = { value: T; label: ComponentChildren }

// Segmented is a row of tabs that fills the width on phones (44px tall) and shrinks to fit on desktop.
export function Segmented<T extends string>({ items, value, onChange, label, className }: {
  items: Item<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    // More than three tabs wrap into a 2-column grid on phones instead of overflowing.
    <div role="tablist" aria-label={label} className={cn("w-full gap-1 rounded-sm border bg-[#f7f8fa] p-1 md:inline-flex md:w-auto", items.length > 3 ? "grid grid-cols-2" : "flex", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            // Labels may wrap on a phone rather than spill out of their cell; one line from md up.
            "flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1 text-center text-sm leading-tight text-muted-foreground md:min-h-8 md:flex-none md:px-4 md:py-0 md:whitespace-nowrap",
            // No font-weight change: bolder text is wider and would nudge the neighbouring tabs.
            value === it.value && "bg-white text-primary shadow-sm",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
