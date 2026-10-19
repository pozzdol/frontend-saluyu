import { ArrowLeft, ArrowLeftRight, BookOpen, ChevronRight, CreditCard, Eye, EyeOff, FileUp, NotebookPen, Repeat, FileText, Flag, LayoutDashboard, MailWarning, Menu, PiggyBank, Scale, ScanSearch, UserRound, Users, UsersRound, X } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Logo } from "@/components/site"
import { resendVerification, useAuth, useInboxCount } from "@/lib/api"
import { Info, type TermKey } from "@/components/term"
import { useT, type Key } from "@/lib/i18n"
import { amountsHidden, cn, setAmountsHidden } from "@/lib/utils"
import { QuickAdd } from "@/components/quick-add"
import { Toaster } from "@/components/toast"

type NavItem = { href: string; label: Key; icon: typeof LayoutDashboard; also?: string[] }

// Grouped by what people come to do, so twelve links read as five short lists.
// "also": pages reached from this item that should keep it highlighted.
const groups: { label: Key; items: NavItem[] }[] = [
  { label: "nav.groupMoney", items: [
    { href: "/app/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
    { href: "/app/transactions", label: "nav.transactions", icon: ArrowLeftRight },
    { href: "/app/recurring", label: "nav.recurring", icon: Repeat },
    { href: "/app/import", label: "nav.import", icon: FileUp },
  ] },
  { label: "nav.groupPlan", items: [
    { href: "/app/budgets", label: "nav.budgets", icon: PiggyBank },
    { href: "/app/cards", label: "nav.cards", icon: CreditCard, also: ["/app/installments"] },
  ] },
  { label: "nav.groupPeople", items: [
    { href: "/app/contacts", label: "nav.contacts", icon: Users },
    { href: "/app/groups", label: "nav.groups", icon: UsersRound },
  ] },
  { label: "nav.groupCheck", items: [
    { href: "/app/reports", label: "nav.reports", icon: FileText },
    { href: "/app/reconcile", label: "nav.reconcile", icon: ScanSearch },
  ] },
  { label: "nav.groupSetup", items: [
    { href: "/app/accounts", label: "nav.accounts", icon: BookOpen },
    { href: "/account", label: "nav.profile", icon: UserRound, also: ["/app/privacy"] },
  ] },
]

// Tools that rewrite the books rather than record everyday money: out of the main list,
// one tap away under "Advanced".
const advanced: NavItem[] = [
  { href: "/app/opening", label: "nav.opening", icon: Flag },
  { href: "/app/journal", label: "nav.journal", icon: NotebookPen },
  { href: "/app/trial-balance", label: "nav.trialBalance", icon: Scale },
]

const advancedKey = "saluyu.nav.advanced"

function NavLinks({ path, inbox }: { path: string; inbox: number }) {
  const t = useT()
  const under = (href: string) => path === href || path.startsWith(href + "/")
  const isActive = (href: string, also: string[] = []) => under(href) || also.some(under)
  const inAdvanced = advanced.some((a) => isActive(a.href))
  // The group remembers whether you left it open, across pages and re-renders; it also
  // opens by itself on its own pages.
  const [open, setOpen] = useState(() => {
    try {
      return inAdvanced || localStorage.getItem(advancedKey) === "1"
    } catch {
      return inAdvanced
    }
  })
  const toggle = (next: boolean) => {
    setOpen(next)
    try {
      localStorage.setItem(advancedKey, next ? "1" : "0")
    } catch {
      /* private mode: remembered for this page only */
    }
  }
  const link = ({ href, label, icon: Icon, also }: NavItem) => {
        const active = isActive(href, also)
        return (
          <a
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-sm px-3 text-base text-foreground/75 hover:bg-[#eaf2ff] hover:text-primary lg:min-h-9 lg:text-sm",
              active && "bg-[#eaf2ff] font-medium text-primary",
            )}
          >
            <Icon className="size-4" />
            {t(label)}
            {href === "/app/groups" && inbox > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground tabular-nums">
                {inbox}
                <span className="sr-only"> {t("nav.waiting")}</span>
              </span>
            )}
          </a>
        )
  }
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label={t("nav.console")}>
      {groups.map((g, i) => (
        <div key={g.label} className={cn("flex flex-col gap-1", i > 0 && "mt-3")}>
          <p className="px-3 pb-0.5 text-xs font-medium text-muted-foreground">{t(g.label)}</p>
          {g.items.map(link)}
        </div>
      ))}
      {/* Native disclosure: no script, keyboard and screen readers work; open on its own pages. */}
      <details open={open} onToggle={(e) => toggle((e.currentTarget as HTMLDetailsElement).open)} className="group mt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-sm px-3 text-sm text-muted-foreground hover:text-primary lg:min-h-9 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
          {t("nav.advanced")}
        </summary>
        <div className="mt-1 flex flex-col gap-1">{advanced.map(link)}</div>
      </details>
    </nav>
  )
}

// AppShell is the console layout: a fixed sidebar on desktop; on phones a top bar whose
// menu button opens the same links in a drawer from the left.
export function AppShell({ title, term, actions, back, children }: {
  title: string
  back?: { href: string; label: string } // a detail page's way back, shown above the title
  term?: TermKey // shows an ⓘ next to the title explaining the page's finance term
  actions?: ComponentChildren
  children: ComponentChildren
}) {
  const t = useT()
  const { path } = useLocation()
  const { user } = useAuth()
  const inbox = useInboxCount()
  const [menu, setMenu] = useState(false)
  useEffect(() => setMenu(false), [path]) // close the drawer after navigating

  return (
    <div className="min-h-svh bg-[#f7f8fa] lg:grid lg:grid-cols-[15rem_1fr] print:block print:bg-white">
      <aside className="sticky top-0 hidden h-svh border-r bg-background lg:block print:hidden">
        <div className="flex h-14 items-center px-5">
          <Logo />
        </div>
        <div className="px-3 pb-3"><QuickAdd variant="sidebar" /></div>
        <NavLinks path={path} inbox={inbox} />
        <div className="px-3 pt-3"><HideAmounts /></div>
        {user && (
          <p className="truncate px-6 pt-3 text-xs text-muted-foreground" title={user.email}>
            {user.email}
          </p>
        )}
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden print:hidden">
        <Sheet open={menu} onOpenChange={setMenu}>
          <SheetTrigger asChild>
            <button type="button" aria-label={inbox > 0 ? t("nav.menuWaiting", { n: inbox }) : t("nav.menu")} className="relative grid size-11 place-items-center rounded-sm hover:bg-muted">
              <Menu className="size-5" />
              {inbox > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-primary" />}
            </button>
          </SheetTrigger>
          <SheetContent side="left" title="Saluyu">
            <div className="-mx-4 grid gap-4 pb-4">
              <NavLinks path={path} inbox={inbox} />
              {user && <p className="truncate px-6 text-xs text-muted-foreground">{user.email}</p>}
            </div>
          </SheetContent>
        </Sheet>
        <Logo />
        <div className="ml-auto"><HideAmounts compact /></div>
      </div>

      <div className="min-w-0">
        {user && !user.email_verified && <VerifyBanner email={user.email} />}
        <header className="bg-gradient-to-b from-[#eaf2ff] to-[#f7f8fa]">
          {/* Fixed-height title row, controls centred in it: the title sits at the same spot on every
              page whatever controls the page puts next to it (they wrap below it on phones). */}
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-6 pb-5 md:min-h-[5.75rem] lg:px-8 lg:pt-8 lg:pb-6">
            <div className="grid min-w-0 gap-1">
              {back && (
                <a href={back.href} className="flex w-fit items-center gap-1 text-sm text-primary hover:underline">
                  <ArrowLeft className="size-4" /> {back.label}
                </a>
              )}
              <h1 className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight">
                {title}
                {term && <Info k={term} />}
              </h1>
            </div>
            {actions}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-[max(6rem,env(safe-area-inset-bottom))] lg:px-8 lg:pb-16">{children}</main>
      </div>
      <QuickAdd variant="fab" />
      <Toaster />
    </div>
  )
}

// HideAmounts is the eye that masks every amount on this device (someone looking over a shoulder).
function HideAmounts({ compact }: { compact?: boolean }) {
  const t = useT()
  const label = amountsHidden ? t("f12.showAmounts") : t("f12.hideAmounts")
  const Icon = amountsHidden ? Eye : EyeOff
  return (
    <button type="button" aria-pressed={amountsHidden} aria-label={label} title={label} onClick={() => setAmountsHidden(!amountsHidden)}
      className={cn("flex min-h-11 items-center gap-3 rounded-sm px-3 text-foreground/75 hover:bg-[#eaf2ff] hover:text-primary", compact ? "size-11 justify-center px-0" : "w-full text-base lg:min-h-9 lg:text-sm")}>
      <Icon className="size-4" />
      {!compact && label}
    </button>
  )
}

const verifyKey = "saluyu.verifyDismissed"

// VerifyBanner stays until the email is verified (invites to it are hidden until then),
// or until closed on this device.
function VerifyBanner({ email }: { email: string }) {
  const t = useT()
  const [state, setState] = useState<"" | "busy" | "sent" | "failed">("")
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(verifyKey) === email
    } catch {
      return false
    }
  })
  if (closed) return null
  const close = () => {
    try {
      localStorage.setItem(verifyKey, email)
    } catch {
      /* private mode: closed for this page only */
    }
    setClosed(true)
  }
  async function resend() {
    setState("busy")
    setState(await resendVerification().then(() => "sent" as const, () => "failed" as const))
  }
  return (
    <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 lg:items-center lg:px-8 print:hidden">
      <MailWarning className="mt-0.5 size-4 shrink-0 lg:mt-0" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="mr-auto">{t("verify.banner", { email })}</span>
      {state === "sent" ? (
        <span role="status">{t("verify.sent")}</span>
      ) : (
        <button type="button" disabled={state === "busy"} onClick={resend} className="font-medium underline underline-offset-2 disabled:opacity-60">
          {state === "failed" ? t("verify.retry") : t("verify.resend")}
        </button>
      )}
      </div>
      <button type="button" onClick={close} aria-label={t("f12.dismiss")} title={t("f12.dismiss")} className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-sm hover:bg-amber-100 lg:size-8">
        <X className="size-4" />
      </button>
    </div>
  )
}

// Soon stands in for a card that has no data yet: one line saying when it will appear.
export function Soon({ children }: { children: ComponentChildren }) {
  return <p className="rounded-sm border bg-card px-4 py-3 text-sm text-muted-foreground">{children}</p>
}

// Table wrapper: horizontal scroll on small screens instead of a squashed layout.
export function TableCard({ children, className }: { children: ComponentChildren; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-sm border bg-card", className)}>
      <table className="w-full text-sm [&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-muted-foreground [&_thead]:bg-[#f7f8fa] [&_tr]:border-b [&_tbody_tr:last-child]:border-0">
        {children}
      </table>
    </div>
  )
}

// MobileList replaces a table below the md breakpoint: one card-like row per record,
// the most important value on the right, details underneath. Pair it with a TableCard
// that has className="hidden md:block".
export function MobileList({ children, empty, className }: { children: ComponentChildren; empty?: ComponentChildren; className?: string }) {
  return (
    <ul className={cn("divide-y rounded-sm border bg-card md:hidden", className)}>
      {children}
      {empty && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</li>}
    </ul>
  )
}

export function MobileItem({ lead, title, meta, value, valueClass, href, onClick, actions }: {
  onClick?: () => void // the whole row opens something, like href but without navigating
  lead?: ComponentChildren // sits outside the link, so it can be its own button
  title: ComponentChildren
  meta?: ComponentChildren
  value?: ComponentChildren
  valueClass?: string
  href?: string
  actions?: ComponentChildren
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {meta && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {(value !== undefined || actions) && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          {value !== undefined && <div className={cn("text-right font-semibold tabular-nums", valueClass)}>{value}</div>}
          {actions}
        </div>
      )}
    </>
  )
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {lead}
      {href ? (
        <a href={href} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm">{body}</a>
      ) : onClick ? (
        <button type="button" onClick={onClick} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left text-sm">{body}</button>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm">{body}</div>
      )}
    </li>
  )
}
