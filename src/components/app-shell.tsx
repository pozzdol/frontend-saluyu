import { ArrowLeftRight, BookOpen, FileText, Flag, LayoutDashboard, PiggyBank, Scale, ScanSearch, UserRound, Users, UsersRound } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useLocation } from "preact-iso"
import { Logo } from "@/components/site"
import { useAuth, useInboxCount } from "@/lib/api"
import { cn } from "@/lib/utils"

const nav = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/app/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/app/contacts", label: "Contacts", icon: Users },
  { href: "/app/groups", label: "Groups", icon: UsersRound },
  { href: "/app/reports", label: "Reports", icon: FileText },
  { href: "/app/accounts", label: "Accounts", icon: BookOpen },
  { href: "/app/reconcile", label: "Reconcile", icon: ScanSearch },
  { href: "/app/trial-balance", label: "Trial balance", icon: Scale },
  { href: "/app/opening", label: "Opening balance", icon: Flag },
  { href: "/account", label: "Profile", icon: UserRound },
]

// AppShell is the console layout: sidebar on desktop, a scrolling tab row on phones.
export function AppShell({ title, actions, children }: { title: string; actions?: ComponentChildren; children: ComponentChildren }) {
  const { path } = useLocation()
  const { user } = useAuth()
  const inbox = useInboxCount()

  return (
    <div className="min-h-svh bg-[#f7f8fa] lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 z-30 border-b bg-background lg:h-svh lg:border-r lg:border-b-0">
        <div className="flex h-14 items-center px-4 lg:px-5">
          <Logo />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:px-3 lg:pb-0" aria-label="Console">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(href + "/")
            return (
              <a
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-foreground/75 hover:bg-[#eaf2ff] hover:text-primary",
                  active && "bg-[#eaf2ff] font-medium text-primary",
                )}
              >
                <Icon className="size-4" />
                {label}
                {href === "/app/groups" && inbox > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground tabular-nums">
                    {inbox}
                    <span className="sr-only"> waiting for you</span>
                  </span>
                )}
              </a>
            )
          })}
        </nav>
        {user && (
          <p className="hidden truncate px-6 pt-6 text-xs text-muted-foreground lg:block" title={user.email}>
            {user.email}
          </p>
        )}
      </aside>

      <div className="min-w-0">
        <header className="bg-gradient-to-b from-[#eaf2ff] to-[#f7f8fa]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3 px-4 pt-8 pb-6 lg:px-8">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {actions}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-16 lg:px-8">{children}</main>
      </div>
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
