import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Sheet is a Radix Dialog that slides in from an edge. Focus trap, Escape and the
// backdrop click come from Radix; we only add the layout.
function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

const sides = {
  bottom:
    "inset-x-0 bottom-0 max-h-[85svh] rounded-t-xl border-t pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  left: "inset-y-0 left-0 h-full w-[min(20rem,85vw)] border-r pt-[env(safe-area-inset-top)] data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  right:
    "inset-y-0 right-0 h-full w-[min(24rem,90vw)] border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
}

function SheetContent({
  className,
  children,
  side = "bottom",
  title,
  description,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof sides
  title: string
  description?: string
}) {
  // Preact does not bubble events from a portal up the component tree the way React does, so
  // Radix takes a tap inside a nested popover or sheet (both portaled to <body>) for a tap
  // outside this sheet and closes it. That tap belongs to the layer on top: ignore it here.
  const overlay = React.useRef<HTMLDivElement>(null)
  const { onInteractOutside, ...rest } = props
  const keepOpen = (e: Event) => {
    const el = e.target
    if (!(el instanceof Element)) return
    if (el.closest("[data-radix-popper-content-wrapper], [role=dialog]") || (el.matches("[data-slot=sheet-overlay]") && el !== overlay.current)) e.preventDefault()
  }
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay ref={overlay} data-slot="sheet-overlay" className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col bg-background shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:duration-150",
          sides[side],
          className,
        )}
        {...rest}
        onInteractOutside={(e) => (keepOpen(e), onInteractOutside?.(e))}
      >
        {side === "bottom" && <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted" />}
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
          <SheetPrimitive.Title className="mr-auto text-base font-semibold">{title}</SheetPrimitive.Title>
          <SheetPrimitive.Close className="grid size-11 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <XIcon className="size-5" />
            <span className="sr-only">{t("common.close")}</span>
          </SheetPrimitive.Close>
        </div>
        {description ? (
          <SheetPrimitive.Description className="px-4 pb-2 text-sm text-muted-foreground">{description}</SheetPrimitive.Description>
        ) : (
          <SheetPrimitive.Description className="sr-only">{title}</SheetPrimitive.Description>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">{children}</div>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent }
