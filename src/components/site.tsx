import { Scale, X } from "lucide-react"
import { useState } from "preact/hooks"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/api"

export function Logo() {
  return (
    <a href="/" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
      <span className="grid size-7 place-items-center rounded-sm bg-primary text-primary-foreground">
        <Scale className="size-4" />
      </span>
      Saluyu
    </a>
  )
}

export function PromoBar() {
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div className="relative bg-gradient-to-r from-[#dbe8ff] via-[#eef4ff] to-[#dbe8ff] px-10 py-2 text-center text-xs text-foreground sm:text-sm">
      <span className="font-medium">Ledger API 1.0 is live.</span>{" "}
      <span className="text-muted-foreground">New workspaces get 3 months free.</span>{" "}
      <a href="/register" className="font-medium text-primary hover:underline">
        Claim now ›
      </a>
      <button
        type="button"
        aria-label="Close announcement"
        onClick={() => setOpen(false)}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

const nav = [
  { label: "Product", href: "/#types" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Use cases", href: "/#use-cases" },
  { label: "FAQ", href: "/#faq" },
]

export function SiteHeader() {
  const { user } = useAuth()
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="text-foreground/80 hover:text-primary">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Button asChild size="lg" className="rounded-sm px-4">
              <a href="/account">Console</a>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="lg" className="rounded-sm px-3">
                <a href="/login">Sign in</a>
              </Button>
              <Button asChild size="lg" className="rounded-sm px-4">
                <a href="/register">Get started</a>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-[#f7f8fa]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <p>© {new Date().getFullYear()} Saluyu. Built with Go, Gin and PostgreSQL.</p>
      </div>
    </footer>
  )
}
