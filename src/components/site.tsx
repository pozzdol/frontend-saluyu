import { X } from "lucide-react"
import { useState } from "preact/hooks"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/api"
import { chooseLocale, useLocale, useT, type Key } from "@/lib/i18n"
import { install, isInstalled } from "@/lib/install"
import { cn } from "@/lib/utils"

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

const promoKey = "saluyu.promo.closed"
const promoClosed = () => { try { return localStorage.getItem(promoKey) === "1" } catch { return false } }

// PromoBar offers "add to home screen". It installs for real where the browser allows, explains
// the Share-menu steps elsewhere, hides once installed, and stays closed once closed.
export function PromoBar() {
  const t = useT()
  const [open, setOpen] = useState(() => !promoClosed() && !isInstalled())
  const [howTo, setHowTo] = useState<"" | "ios" | "manual">("")
  if (!open) return null
  const close = () => {
    setOpen(false)
    try { localStorage.setItem(promoKey, "1") } catch { /* private mode */ }
  }
  const tryInstall = async () => {
    const r = await install()
    if (r === "accepted") close()
    else if (r === "ios" || r === "manual") setHowTo(r)
  }
  return (
    <div role="region" aria-label={t("site.promoLive")} className="relative bg-gradient-to-r from-[#dbe8ff] via-[#eef4ff] to-[#dbe8ff] px-10 py-2 text-center text-xs text-foreground sm:text-sm">
      {howTo ? (
        <span>{t(howTo === "ios" ? "site.installIos" : "site.installManual")}</span>
      ) : (
        <>
          <span className="font-medium">{t("site.promoLive")}</span>{" "}
          <span className="text-muted-foreground">{t("site.promoFree")}</span>{" "}
          <button type="button" onClick={tryInstall} className="font-medium text-primary hover:underline">
            {t("site.promoClaim")}
          </button>
        </>
      )}
      <button
        type="button"
        aria-label={t("site.closePromo")}
        onClick={close}
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
    <>
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
    </header>
    {/* Phones: the same section links in a row under the header that scrolls away with the page. */}
    <nav aria-label={t("site.sections")} className="flex gap-5 overflow-x-auto border-b bg-background px-4 py-2 text-sm md:hidden">
      {nav.map((n) => (
        <a key={n.href} href={n.href} onClick={onSectionLink} className="shrink-0 py-1 text-foreground/80 hover:text-primary">
          {t(n.label)}
        </a>
      ))}
    </nav>
    </>
  )
}

export function SiteFooter() {
  const t = useT()
  const locale = useLocale()
  return (
    <footer className="border-t bg-[#f7f8fa]">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted-foreground sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="grid gap-3">
          <Logo />
          <p>{t("site.footer", { year: new Date().getFullYear() })}</p>
        </div>
        <div className="grid gap-4 sm:justify-items-end">
          <nav aria-label={t("site.footerLinks")} className="flex flex-wrap gap-x-5 gap-y-2">
            {nav.map((n) => (
              <a key={n.href} href={n.href} onClick={onSectionLink} className="hover:text-primary">{t(n.label)}</a>
            ))}
            <a href="/login" className="hover:text-primary">{t("site.signIn")}</a>
          </nav>
          <div role="group" aria-label={t("prof.language")} className="flex items-center gap-1">
            {(["id", "en"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={locale === l} onClick={() => chooseLocale(l)}
                className={cn("h-9 rounded-sm px-3 hover:text-primary", locale === l && "bg-background font-medium text-foreground shadow-sm")}>
                {l === "id" ? "Bahasa Indonesia" : "English"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
