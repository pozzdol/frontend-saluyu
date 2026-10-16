import { ArrowLeftRight, BookOpen, FileText, Flag, LayoutDashboard, Menu, PiggyBank, Scale, ScanSearch, UserRound, Users, UsersRound } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Logo } from "@/components/site"
import { useAuth, useInboxCount } from "@/lib/api"
import { Info, type TermKey } from "@/components/term"
import { useT, type Key } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { QuickAdd } from "@/components/quick-add"
import { Toaster } from "@/components/toast"

const nav: { href: string; label: Key; icon: typeof LayoutDashboard }[] = [
  { href: "/app/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/app/transactions", label: "nav.transactions", icon: ArrowLeftRight },
  { href: "/app/budgets", label: "nav.budgets", icon: PiggyBank },
  { href: "/app/contacts", label: "nav.contacts", icon: Users },
  { href: "/app/groups", label: "nav.groups", icon: UsersRound },
  { href: "/app/reports", label: "nav.reports", icon: FileText },
  { href: "/app/accounts", label: "nav.accounts", icon: BookOpen },
  { href: "/app/reconcile", label: "nav.reconcile", icon: ScanSearch },
  { href: "/app/trial-balance", label: "nav.trialBalance", icon: Scale },
  { href: "/app/opening", label: "nav.opening", icon: Flag },
  { href: "/account", label: "nav.profile", icon: UserRound },
]

function NavLinks({ path, inbox }: { path: string; inbox: number }) {
  const t = useT()
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label={t("nav.console")}>
      {nav.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/")
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
      })}
    </nav>
  )
}

// AppShell is the console layout: a fixed sidebar on desktop; on phones a top bar whose
// menu button opens the same links in a drawer from the left.
export function AppShell({ title, term, actions, children }: {
  title: string
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
    <div className="min-h-svh bg-[#f7f8fa] lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-svh border-r bg-background lg:block">
        <div className="flex h-14 items-center px-5">
          <Logo />
        </div>
        <div className="px-3 pb-3"><QuickAdd variant="sidebar" /></div>
        <NavLinks path={path} inbox={inbox} />
        {user && (
          <p className="truncate px-6 pt-6 text-xs text-muted-foreground" title={user.email}>
            {user.email}
          </p>
        )}
      </aside>

      <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
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
      </div>

      <div className="min-w-0">
        <header className="bg-gradient-to-b from-[#eaf2ff] to-[#f7f8fa]">
          {/* Fixed-height title row, controls centred in it: the title sits at the same spot on every
              page whatever controls the page puts next to it (they wrap below it on phones). */}
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-6 pb-5 md:min-h-[5.75rem] lg:px-8 lg:pt-8 lg:pb-6">
            <h1 className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight">
              {title}
              {term && <Info k={term} />}
            </h1>
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
