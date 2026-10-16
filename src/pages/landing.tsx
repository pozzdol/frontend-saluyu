import {
  ArrowRight,
  BarChart3,
  Check,
  CreditCard,
  EyeOff,
  FileUp,
  KeyRound,
  Repeat,
  Target,
  Users,
  WifiOff,
  Zap,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { useEffect, useLayoutEffect, useRef } from "preact/hooks"
import { animate, utils, type JSAnimation } from "animejs"
import { calm, tween, useEntrance, useReveal } from "@/lib/motion"
import { LogoMark, PromoBar, SiteFooter, SiteHeader, onSectionLink, scrollToHash } from "@/components/site"
import { useT, type Key } from "@/lib/i18n"
import { cn, fmtIDR } from "@/lib/utils"

// Everything on this page describes what the app really does today; nothing is promised
// that the code does not have (no prices, no testimonials).

const features: { icon: typeof Zap; title: Key; text: Key }[] = [
  { icon: Zap, title: "land.f.quick.title", text: "land.f.quick.text" },
  { icon: Target, title: "land.f.budget.title", text: "land.f.budget.text" },
  { icon: CreditCard, title: "land.f.cards.title", text: "land.f.cards.text" },
  { icon: Repeat, title: "land.f.recurring.title", text: "land.f.recurring.text" },
  { icon: FileUp, title: "land.f.import.title", text: "land.f.import.text" },
  { icon: BarChart3, title: "land.f.reports.title", text: "land.f.reports.text" },
  { icon: Users, title: "land.f.family.title", text: "land.f.family.text" },
  { icon: WifiOff, title: "land.f.offline.title", text: "land.f.offline.text" },
]

const steps: { title: Key; text: Key }[] = [
  { title: "land.s1.title", text: "land.s1.text" },
  { title: "land.s2.title", text: "land.s2.text" },
  { title: "land.s3.title", text: "land.s3.text" },
]

// Everyday words on top, the accounting term underneath: the same pairs the app's ⓘ uses.
const words: { term: Key; official: Key; dot: string }[] = [
  { term: "glossary.asset.label", official: "glossary.asset.official", dot: "bg-sky-500" },
  { term: "glossary.liability.label", official: "glossary.liability.official", dot: "bg-amber-500" },
  { term: "glossary.equity.label", official: "glossary.equity.official", dot: "bg-violet-500" },
  { term: "glossary.revenue.label", official: "glossary.revenue.official", dot: "bg-emerald-500" },
  { term: "glossary.expense.label", official: "glossary.expense.official", dot: "bg-rose-500" },
]

const privacy: { icon: typeof Zap; title: Key; text: Key }[] = [
  { icon: EyeOff, title: "land.p.group.title", text: "land.p.group.text" },
  { icon: KeyRound, title: "land.p.account.title", text: "land.p.account.text" },
  { icon: FileUp, title: "land.p.export.title", text: "land.p.export.text" },
]

const faq = ["accounting", "together", "banks", "offline", "data", "language"]

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div data-reveal className="mx-auto max-w-2xl text-center">
      <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      <p className="mt-3 text-sm text-muted-foreground">{sub}</p>
    </div>
  )
}

const SAFE = 12_500_000 // sen: the example's Rp 125.000

// The page's one moment of motion: the phone settles in, the safe-to-spend figure counts up and
// the spending bar fills category by category, the way a fresh month reads on the dashboard.
function useHeroMotion() {
  const root = useRef<HTMLDivElement>(null)
  const safe = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const write = (n: number) => (safe.current!.textContent = fmtIDR(n === SAFE ? n : Math.round(n / 100) * 100))
    if (calm()) return void write(SAFE)
    const el = root.current!
    const segs = el.querySelectorAll<HTMLElement>("[data-seg]")
    const rows = el.querySelectorAll<HTMLElement>("[data-row]")
    const late = el.querySelector<HTMLElement>("[data-late]")!
    utils.set([...rows, late], { opacity: 0 })
    write(0)
    const run: (JSAnimation | null)[] = [
      animate(el, { y: [28, 0], opacity: [0, 1], duration: 900, ease: "outExpo" }),
      tween(0, SAFE, write, { duration: 1400, delay: 250 }),
      ...[...segs].map((s, i) => animate(s, { width: ["0%", s.style.width], duration: 700, delay: 500 + i * 110, ease: "outQuart" })),
      ...[...rows].map((r, i) => animate(r, { opacity: [0, 1], x: [-6, 0], duration: 500, delay: 600 + i * 110, ease: "outQuart" })),
      animate(late, { opacity: [0, 1], y: [8, 0], duration: 600, delay: 1200, ease: "outQuart" }),
    ]
    return () => run.forEach((a) => a?.revert())
  }, [])
  return { root, safe }
}

// HeroPhone is a drawing of the dashboard with example numbers (labelled as an example),
// not a screenshot, so it never goes out of date with the real screens.
function HeroPhone() {
  const t = useT()
  const cats: [string, number, string][] = [
    [t("land.demo.food"), 46, "bg-[#2563eb]"],
    [t("land.demo.transport"), 27, "bg-[#f97316]"],
    [t("land.demo.snacks"), 17, "bg-[#10b981]"],
    [t("land.demo.other"), 10, "bg-[#a855f7]"],
  ]
  const { root, safe } = useHeroMotion()
  return (
    <div ref={root} className="relative mx-auto w-full max-w-xs" aria-label={t("land.demo.label")} role="img">
      <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-white/80 to-[#d6e5ff]/70 shadow-[0_30px_80px_-30px_rgba(0,82,217,0.45)]" />
      <div className="relative grid gap-3 rounded-[2rem] border-8 border-white bg-[#f7f8fa] p-4 shadow-xl" aria-hidden="true">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-6 place-items-center rounded-sm bg-primary text-primary-foreground"><LogoMark className="size-3.5" /></span>
          {t("land.demo.overview")}
        </div>
        <div className="rounded-xl bg-gradient-to-br from-[#0052d9] to-[#2b74f0] p-3 text-white">
          <p className="text-[11px] text-white/80">{t("land.demo.safe")}</p>
          <p ref={safe} className="text-2xl font-bold tabular-nums" />
          <p className="text-[10px] text-white/80">{t("land.demo.safeNote")}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="mb-2 text-[11px] font-semibold">{t("land.demo.where")}</p>
          <div className="flex h-2.5 overflow-hidden rounded-full">
            {cats.map(([name, pct, tone]) => <span key={name} data-seg className={tone} style={{ width: `${pct}%` }} />)}
          </div>
          <ul className="mt-2 grid gap-1 text-[11px]">
            {cats.map(([name, pct, tone]) => (
              <li key={name} data-row className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-sm", tone)} />
                <span className="flex-1">{name}</span>
                <span className="tabular-nums text-muted-foreground">{pct}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div data-late className="rounded-xl bg-white p-3 text-[11px]">
          <p className="font-semibold">{t("land.demo.insight")}</p>
          <p className="mt-1 text-muted-foreground">{t("land.demo.insightText")}</p>
        </div>
        <p className="text-center text-[10px] text-muted-foreground">{t("land.demo.example")}</p>
      </div>
    </div>
  )
}

export function Landing() {
  const t = useT()
  const page = useReveal<HTMLDivElement>()
  const hero = useEntrance<HTMLDivElement>()
  // Arriving from another page with /#section: jump there once the sections exist.
  useEffect(() => {
    if (location.hash) scrollToHash(location.hash, false)
  }, [])
  return (
    <div ref={page} className="min-h-svh bg-background">
      <PromoBar />
      <SiteHeader />

      <section className="relative overflow-hidden bg-gradient-to-b from-[#eaf2ff] via-[#f4f8ff] to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div ref={hero}>
            <h1 data-enter className="text-4xl font-bold tracking-tight sm:text-5xl">
              {t("land.hero1")} <span className="text-primary">{t("land.hero2")}</span>
            </h1>
            <p data-enter className="mt-5 max-w-xl text-muted-foreground">{t("land.heroSub")}</p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {(["land.point1", "land.point2", "land.point3"] as Key[]).map((k) => (
                <li key={k} data-enter className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{t(k)}</span>
                </li>
              ))}
            </ul>
            <div data-enter className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild className="h-11 rounded-sm px-8">
                <a href="/register">{t("land.start")}</a>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-sm border-primary px-8 text-primary">
                <a href="/#fitur" onClick={onSectionLink}>{t("land.seeFeatures")}</a>
              </Button>
            </div>
            <p data-enter className="mt-3 text-xs text-muted-foreground">{t("land.startNote")}</p>
          </div>
          <HeroPhone />
        </div>
      </section>

      <section id="fitur" className="scroll-mt-28 md:scroll-mt-16 px-4 py-20">
        <SectionTitle title={t("land.featuresTitle")} sub={t("land.featuresSub")} />
        <div data-stagger className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 rounded-sm border bg-gradient-to-b from-[#f4f8ff] to-white p-4 sm:block sm:p-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-primary/10 text-primary"><Icon className="size-5" /></span>
              <div>
                <h3 className="font-semibold sm:mt-4">{t(title)}</h3>
                <p className="mt-1 text-sm text-muted-foreground sm:mt-2">{t(text)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="cara" className="scroll-mt-28 md:scroll-mt-16 bg-[#f7f8fa] px-4 py-20">
        <SectionTitle title={t("land.stepsTitle")} sub={t("land.stepsSub")} />
        <ol data-stagger className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
          {steps.map(({ title, text }, i) => (
            <li key={title} className="rounded-sm border bg-card p-6">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
              <h3 className="mt-4 font-semibold">{t(title)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(text)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-4 py-20">
        <SectionTitle title={t("land.wordsTitle")} sub={t("land.wordsSub")} />
        <ul data-stagger className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {words.map((w) => (
            <li key={w.term} className="rounded-sm border bg-card p-4">
              <p className="flex items-center gap-2 font-semibold"><span className={cn("size-2.5 rounded-full", w.dot)} />{t(w.term)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("land.officialTerm", { term: t(w.official) })}</p>
            </li>
          ))}
        </ul>
        <p data-reveal className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">{t("land.wordsNote")}</p>
      </section>

      <section id="privasi" className="scroll-mt-28 md:scroll-mt-16 bg-[#f7f8fa] px-4 py-20">
        <SectionTitle title={t("land.privacyTitle")} sub={t("land.privacySub")} />
        <div data-stagger className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
          {privacy.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-sm border bg-card p-6">
              <Icon className="size-5 text-primary" />
              <h3 className="mt-3 font-semibold">{t(title)}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t(text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="scroll-mt-28 md:scroll-mt-16 px-4 py-20">
        <SectionTitle title={t("land.faqTitle")} sub={t("land.faqSub")} />
        <Accordion data-reveal type="single" collapsible className="mx-auto mt-10 max-w-3xl rounded-sm border bg-card px-6">
          {faq.map((k) => (
            <AccordionItem key={k} value={k}>
              <AccordionTrigger className="text-left">{t(`land.q.${k}.q` as Key)}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{t(`land.q.${k}.a` as Key)}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section data-stagger className="bg-gradient-to-r from-[#0052d9] to-[#2b74f0] px-4 py-16 text-center text-white">
        <LogoMark className="mx-auto size-9 opacity-90" />
        <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{t("land.ctaTitle")}</h2>
        <p className="mt-2 text-sm text-white/85">{t("land.ctaSub")}</p>
        <Button asChild className="mt-6 h-11 rounded-sm bg-white px-8 text-primary hover:bg-white/90">
          <a href="/register">{t("land.start")} <ArrowRight /></a>
        </Button>
      </section>

      <SiteFooter />
    </div>
  )
}
