import {
  ArrowRight,
  BarChart3,
  Check,
  FileSpreadsheet,
  Landmark,
  Receipt,
  Scale,
  Store,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PromoBar, SiteFooter, SiteHeader } from "@/components/site"
import { cn } from "@/lib/utils"

// The five types and their normal balances match the account_type enum in the database.
const accountTypes = [
  { name: "Asset", balance: "Debit", dot: "bg-sky-500", example: "Cash, receivables, inventory" },
  { name: "Liability", balance: "Credit", dot: "bg-amber-500", example: "Payables, loans, accrued tax" },
  { name: "Equity", balance: "Credit", dot: "bg-violet-500", example: "Owner capital, retained earnings" },
  { name: "Revenue", balance: "Credit", dot: "bg-emerald-500", example: "Sales, service income, interest" },
  { name: "Expense", balance: "Debit", dot: "bg-rose-500", example: "Rent, salaries, utilities" },
]

const plans = [
  {
    name: "Lite",
    tagline: "Perfect for side projects",
    entries: "1,000",
    note: "1 workspace",
    price: "$7",
    features: ["Full chart of accounts", "Approximately 30 invoices a month"],
  },
  {
    name: "Standard",
    tagline: "Daily bookkeeping, great value",
    entries: "2,600",
    note: "Approx. 2.6x Lite",
    price: "$17",
    popular: true,
    features: ["Suitable for small shops and studios", "Approximately 90 invoices a month"],
  },
  {
    name: "Pro",
    tagline: "For growing teams",
    entries: "7,900",
    note: "Approx. 7.9x Lite",
    price: "$51",
    features: ["For finance teams closing books monthly", "Approximately 260 invoices a month"],
  },
  {
    name: "Max",
    tagline: "High-volume accounting",
    entries: "15,900",
    note: "Approx. 15.9x Lite",
    price: "$103",
    features: ["For platforms that post entries from code", "Approximately 530 invoices a month"],
  },
]

const useCases = [
  { icon: Store, title: "Point of sale", text: "Post every sale as a balanced journal entry straight from the checkout." },
  { icon: Receipt, title: "Invoicing", text: "Track receivables against the right Asset and Revenue accounts automatically." },
  { icon: BarChart3, title: "Reporting", text: "Build trial balances and income statements from one consistent ledger." },
  { icon: FileSpreadsheet, title: "Migration", text: "Import an existing chart of accounts and keep your account codes." },
]

const faq = [
  {
    q: "How do I sign in from my own app?",
    a: "Call POST /api/v1/login. You get a short-lived access token in the response and a refresh token in an HttpOnly cookie. Call /api/v1/auth/refresh when the access token expires.",
  },
  {
    q: "What happens when I change my password?",
    a: "Every other device is signed out immediately. The device that changed the password receives a fresh session and keeps working.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrades apply immediately and unused entries carry over to the end of the billing month.",
  },
  {
    q: "Is there a free trial?",
    a: "New workspaces get three months of the Lite plan for free. No card required.",
  },
]

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <p className="mt-3 text-sm text-muted-foreground">{sub}</p>
    </div>
  )
}

function HeroArt() {
  // Floating account chips around a soft "balance" tile, echoing the model chips on TokenHub.
  const chips = [
    { t: "Asset", pos: "left-[6%] top-[38%]", dot: "bg-sky-500" },
    { t: "Liability", pos: "right-[4%] top-[14%]", dot: "bg-amber-500" },
    { t: "Equity", pos: "left-[16%] top-[8%]", dot: "bg-violet-500" },
    { t: "Revenue", pos: "right-[0%] top-[46%]", dot: "bg-emerald-500" },
    { t: "Expense", pos: "right-[14%] bottom-[10%]", dot: "bg-rose-500" },
  ]
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-md" aria-hidden="true">
      <div className="absolute inset-[12%] rounded-[2rem] bg-gradient-to-br from-white/80 to-[#d6e5ff]/70 shadow-[0_30px_80px_-30px_rgba(0,82,217,0.45)] ring-1 ring-white" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="grid size-24 place-items-center rounded-2xl bg-white shadow-lg ring-1 ring-[#e3ecfb]">
          <Scale className="size-10 text-primary" />
        </div>
      </div>
      {chips.map((c) => (
        <div
          key={c.t}
          className={cn(
            "absolute flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium shadow-md ring-1 ring-black/5",
            c.pos,
          )}
        >
          <span className={cn("size-2 rounded-full", c.dot)} />
          {c.t}
        </div>
      ))}
    </div>
  )
}

export function Landing() {
  return (
    <div className="min-h-svh bg-background">
      <PromoBar />
      <SiteHeader />

      <section className="relative overflow-hidden bg-gradient-to-b from-[#eaf2ff] via-[#f4f8ff] to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              One ledger, <span className="text-primary">every account</span> in balance.
            </h1>
            <p className="mt-5 max-w-xl text-muted-foreground">
              Sign up once and get a full chart of accounts behind a single API: assets, liabilities, equity, revenue
              and expenses. Unified billing, plug and play.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              {[
                ["Double-entry by default", "every entry balances or it is rejected"],
                ["Standard JSON API", "JWT access tokens with rotating refresh sessions"],
                ["Chart of accounts built in", "five account types with normal balances"],
              ].map(([b, rest]) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <span className="font-semibold">{b}</span> <span className="text-muted-foreground">— {rest}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              {accountTypes.map((t) => (
                <Badge key={t.name} variant="secondary" className="rounded-sm bg-[#e8f0fe] px-3 py-1 text-primary">
                  {t.name}
                </Badge>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild className="h-10 rounded-sm px-8">
                <a href="/register">Start free</a>
              </Button>
              <Button asChild variant="outline" className="h-10 rounded-sm border-primary px-8 text-primary">
                <a href="#pricing">View pricing</a>
              </Button>
              <a href="#faq" className="flex items-center gap-1 text-sm text-primary hover:underline">
                Contact sales <ArrowRight className="size-3.5" />
              </a>
            </div>
            <p className="mt-3 text-xs text-emerald-600">
              Exclusive for new workspaces: 3 months free, no card required.
            </p>
          </div>
          <HeroArt />
        </div>
      </section>

      <section id="pricing" className="scroll-mt-16 px-4 py-20">
        <SectionTitle
          title="Pick a Plan, Get Started"
          sub="Monthly subscription with pooled journal entries. Switch plans freely. Upgrade anytime."
        />
        <div className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-sm border bg-card p-6 shadow-[0_4px_20px_-12px_rgba(0,0,0,0.15)]",
                p.popular && "border-2 border-primary",
              )}
            >
              {p.popular && (
                <span className="absolute -top-px -right-px rounded-bl-sm bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground">
                  Most Popular
                </span>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-6">
                <span className="text-3xl font-bold">{p.entries}</span>{" "}
                <span className="text-sm text-muted-foreground">entries/month</span>
              </p>
              <p className="text-xs font-medium text-primary">{p.note}</p>
              <p className="mt-3">
                <span className="text-2xl font-bold text-primary">{p.price}</span>{" "}
                <span className="text-sm text-muted-foreground">/month</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={p.popular ? "default" : "outline"}
                className={cn("mt-6 h-10 w-full rounded-sm", !p.popular && "bg-[#f3f6fb] text-primary hover:bg-[#e8f0fe]")}
              >
                <a href="/register">Subscribe Now</a>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section id="types" className="scroll-mt-16 bg-[#f7f8fa] px-4 py-20">
        <SectionTitle
          title="Every account type, one API"
          sub="Work with all five account types in the same plan. Normal balances are enforced for you, so reports always add up."
        />
        <div className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {accountTypes.map((t) => (
            <div key={t.name} className="rounded-sm border bg-card p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", t.dot)} />
                <h3 className="font-semibold">{t.name}</h3>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Normal balance</p>
              <p className="text-sm font-medium">{t.balance}</p>
              <p className="mt-3 text-xs text-muted-foreground">{t.example}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="use-cases" className="scroll-mt-16 px-4 py-20">
        <SectionTitle title="What You Can Build" sub="From a single shop to a platform that posts thousands of entries from code." />
        <div className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {useCases.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-sm border bg-gradient-to-b from-[#f4f8ff] to-white p-6">
              <span className="grid size-10 place-items-center rounded-sm bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="scroll-mt-16 bg-[#f7f8fa] px-4 py-20">
        <SectionTitle title="Before you buy, you may want to know" sub="Still unsure? Our team replies within one business day." />
        <Accordion type="single" collapsible className="mx-auto mt-10 max-w-3xl rounded-sm border bg-card px-6">
          {faq.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="bg-gradient-to-r from-[#0052d9] to-[#2b74f0] px-4 py-16 text-center text-white">
        <Landmark className="mx-auto size-8 opacity-80" />
        <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Start now — one ledger, every account.</h2>
        <Button asChild className="mt-6 h-10 rounded-sm bg-white px-8 text-primary hover:bg-white/90">
          <a href="/register">Create free workspace</a>
        </Button>
      </section>

      <SiteFooter />
    </div>
  )
}
