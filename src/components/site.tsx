import { X } from "lucide-react"
import { useState } from "preact/hooks"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/api"
import { useT, type Key } from "@/lib/i18n"

// Saluyu mark: two blades, point-symmetric around (12, 12) on a 24 grid. Colour comes from currentColor.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.1 4.7H21.5Q22.1 4.7 22 5.3C21.3 8.9 18.4 10.6 14.6 10.75L4.9 11.3Q4.3 11.3 4.4 10.7C5.2 7 7.8 4.9 11.1 4.7ZM12.9 19.3H2.5Q1.9 19.3 2 18.7C2.7 15.1 5.6 13.4 9.4 13.25L19.1 12.7Q19.7 12.7 19.6 13.3C18.8 17 16.2 19.1 12.9 19.3Z" />
    </svg>
  )
}

export function Logo() {
  return (
    <a href="/" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
      <span className="grid size-7 place-items-center rounded-sm bg-primary text-primary-foreground">
        <LogoMark className="size-4" />
      </span>
      Saluyu
    </a>
  )
}

export function PromoBar() {
  const t = useT()
  const [open, setOpen] = useState(true)
  if (!open) return null
  return (
    <div className="relative bg-gradient-to-r from-[#dbe8ff] via-[#eef4ff] to-[#dbe8ff] px-10 py-2 text-center text-xs text-foreground sm:text-sm">
      <span className="font-medium">{t("site.promoLive")}</span>{" "}
      <span className="text-muted-foreground">{t("site.promoFree")}</span>{" "}
      <a href="/register" className="font-medium text-primary hover:underline">
        {t("site.promoClaim")}
      </a>
      <button
        type="button"
        aria-label={t("site.closePromo")}
        onClick={() => setOpen(false)}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

const nav: { label: Key; href: string }[] = [
  { label: "site.features", href: "/#fitur" },
  { label: "site.how", href: "/#cara" },
  { label: "site.privacy", href: "/#privasi" },
  { label: "site.faq", href: "/#faq" },
]

// The router handles same-site links by changing the URL without scrolling, so links to a
// landing section scroll by hand when the landing is already open. From another page the
// router goes to "/#section" and the landing scrolls there when it mounts (scrollToHash).
export function scrollToHash(hash: string, smooth = true) {
  const el = hash.length > 1 ? document.getElementById(hash.slice(1)) : null
  if (!el) return false
  el.scrollIntoView({ behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" })
  history.replaceState(null, "", `/${hash}`)
  return true
}

export function onSectionLink(e: MouseEvent) {
  const href = (e.currentTarget as HTMLAnchorElement).getAttribute("href") ?? ""
  if (location.pathname === "/" && scrollToHash(href.slice(href.indexOf("#")))) e.preventDefault()
}

export function SiteHeader() {
  const t = useT()
  const { user } = useAuth()
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4">
        <Logo />
        <nav aria-label={t("site.sections")} className="hidden items-center gap-6 text-sm md:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} onClick={onSectionLink} className="text-foreground/80 hover:text-primary">
              {t(n.label)}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Button asChild size="lg" className="rounded-sm px-4">
              <a href="/app/dashboard">{t("auth.goToApp")}</a>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="lg" className="rounded-sm px-3">
                <a href="/login">{t("site.signIn")}</a>
              </Button>
              <Button asChild size="lg" className="rounded-sm px-4">
                <a href="/register">{t("site.getStarted")}</a>
              </Button>
            </>
          )}
        </div>
      </div>
      {/* Phones: the same section links in a second row that scrolls sideways if needed. */}
      <nav aria-label={t("site.sections")} className="flex gap-5 overflow-x-auto border-t px-4 py-2 text-sm md:hidden">
        {nav.map((n) => (
          <a key={n.href} href={n.href} onClick={onSectionLink} className="shrink-0 py-1 text-foreground/80 hover:text-primary">
            {t(n.label)}
          </a>
        ))}
      </nav>
    </header>
  )
}

export function SiteFooter() {
  const t = useT()
  return (
    <footer className="border-t bg-[#f7f8fa]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <p>{t("site.footer", { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  )
}
