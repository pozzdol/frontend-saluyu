import { Info as InfoIcon } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useRef, useState } from "preact/hooks"
import { useIsMobile } from "@/components/picker"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import type { Dict } from "@/i18n/id"
import { useT, type Key } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type TermKey = keyof Dict["glossary"]

function Explanation({ k }: { k: TermKey }) {
  const t = useT()
  const example = t(`glossary.${k}.example` as Key)
  return (
    <div className="grid gap-2 text-sm leading-relaxed">
      <p>{t(`glossary.${k}.explain` as Key)}</p>
      {example && (
        <p className="rounded-sm bg-[#f4f8ff] px-3 py-2 text-foreground/80">
          <span className="font-medium">{t("common.example")}: </span>
          {example}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("common.officialTerm", { term: t(`glossary.${k}.official` as Key) })}</p>
    </div>
  )
}

// Info is the ⓘ button for one glossary term. On desktop it opens on hover or keyboard focus
// (and click, for touch laptops); on phones a tap opens a bottom sheet with the explanation.
export function Info({ k, className }: { k: TermKey; className?: string }) {
  const t = useT()
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number>()
  const label = t(`glossary.${k}.label` as Key)
  const button = (extra: Record<string, unknown> = {}) => (
    <button
      type="button"
      aria-label={t("common.whatIs", { term: label })}
      onClick={() => setOpen((o) => !o)}
      className={cn("inline-grid size-5 shrink-0 place-items-center rounded-full align-middle text-muted-foreground hover:text-primary focus-visible:text-primary max-md:size-7", className)}
      {...extra}
    >
      <InfoIcon className="size-3.5 max-md:size-4" />
    </button>
  )

  if (mobile) {
    return (
      <>
        {button()}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" title={label}>
            <Explanation k={k} />
          </SheetContent>
        </Sheet>
      </>
    )
  }

  // Hovering the button or the bubble keeps it open; leaving both closes it after a short delay.
  const show = () => (window.clearTimeout(closeTimer.current), setOpen(true))
  const hide = () => (closeTimer.current = window.setTimeout(() => setOpen(false), 150))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{button({ onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide })}</PopoverAnchor>
      <PopoverContent
        side="top"
        className="w-72 rounded-sm p-3"
        onMouseEnter={show}
        onMouseLeave={hide}
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <p className="mb-1.5 font-semibold">{label}</p>
        <Explanation k={k} />
      </PopoverContent>
    </Popover>
  )
}

// Term shows an everyday label for a finance term followed by its ⓘ.
export function Term({ k, children, className }: { k: TermKey; children?: ComponentChildren; className?: string }) {
  const t = useT()
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {children ?? t(`glossary.${k}.label` as Key)}
      <Info k={k} />
    </span>
  )
}
