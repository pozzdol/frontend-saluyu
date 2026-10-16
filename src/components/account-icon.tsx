import {
  Baby, Banknote, Book, Briefcase, Building2, Bus, Car, Clapperboard, Coffee, Coins, Cookie, CreditCard, Dumbbell,
  Fuel, Gamepad2, Gift, GraduationCap, HandCoins, Handshake, HeartPulse, House, Landmark, PawPrint, Percent,
  PiggyBank, Phone, Plane, Receipt, RotateCcw, Scale, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles,
  Store, TrendingUp, Tv, Utensils, Wallet, Wifi, Wrench, Zap,
  type LucideIcon,
} from "lucide-react"
import { useState } from "preact/hooks"
import { Status, toFormError, type FormError } from "@/components/field"
import { useIsMobile } from "@/components/picker"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { updateAccount, type Account, type AccountType } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// Same names, same order as the oneof lists in go-backend/internal/model/ledger.go.
export const icons: Record<string, LucideIcon> = {
  wallet: Wallet, landmark: Landmark, "piggy-bank": PiggyBank, smartphone: Smartphone, "trending-up": TrendingUp,
  "hand-coins": HandCoins, handshake: Handshake, scale: Scale, briefcase: Briefcase, percent: Percent,
  "rotate-ccw": RotateCcw, sparkles: Sparkles, car: Car, utensils: Utensils, cookie: Cookie, clapperboard: Clapperboard,
  house: House, receipt: Receipt, coins: Coins, "shopping-cart": ShoppingCart, "shopping-bag": ShoppingBag,
  coffee: Coffee, bus: Bus, fuel: Fuel, plane: Plane, "heart-pulse": HeartPulse, "graduation-cap": GraduationCap,
  baby: Baby, gift: Gift, shirt: Shirt, zap: Zap, wifi: Wifi, phone: Phone, dumbbell: Dumbbell, "gamepad-2": Gamepad2,
  book: Book, "paw-print": PawPrint, wrench: Wrench, tv: Tv, "credit-card": CreditCard, banknote: Banknote,
  "building-2": Building2, store: Store,
}

// Full class strings so Tailwind finds them: [tile background + icon color, swatch].
export const colors: Record<string, [string, string]> = {
  slate: ["bg-slate-100 text-slate-700", "bg-slate-500"],
  zinc: ["bg-zinc-100 text-zinc-700", "bg-zinc-500"],
  red: ["bg-red-100 text-red-700", "bg-red-500"],
  orange: ["bg-orange-100 text-orange-700", "bg-orange-500"],
  amber: ["bg-amber-100 text-amber-700", "bg-amber-500"],
  yellow: ["bg-yellow-100 text-yellow-700", "bg-yellow-500"],
  lime: ["bg-lime-100 text-lime-700", "bg-lime-500"],
  green: ["bg-green-100 text-green-700", "bg-green-500"],
  emerald: ["bg-emerald-100 text-emerald-700", "bg-emerald-500"],
  teal: ["bg-teal-100 text-teal-700", "bg-teal-500"],
  cyan: ["bg-cyan-100 text-cyan-700", "bg-cyan-500"],
  sky: ["bg-sky-100 text-sky-700", "bg-sky-500"],
  blue: ["bg-blue-100 text-blue-700", "bg-blue-500"],
  indigo: ["bg-indigo-100 text-indigo-700", "bg-indigo-500"],
  violet: ["bg-violet-100 text-violet-700", "bg-violet-500"],
  purple: ["bg-purple-100 text-purple-700", "bg-purple-500"],
  fuchsia: ["bg-fuchsia-100 text-fuchsia-700", "bg-fuchsia-500"],
  pink: ["bg-pink-100 text-pink-700", "bg-pink-500"],
  rose: ["bg-rose-100 text-rose-700", "bg-rose-500"],
}

// An empty icon or color falls back to one per account type.
const byType: Record<AccountType, [string, string]> = {
  Asset: ["wallet", "sky"],
  Liability: ["credit-card", "amber"],
  Equity: ["scale", "violet"],
  Revenue: ["trending-up", "emerald"],
  Expense: ["receipt", "rose"],
}

export const iconOf = (a: Pick<Account, "icon" | "color" | "type">) => ({
  Icon: icons[a.icon] ?? icons[byType[a.type][0]],
  tone: (colors[a.color] ?? colors[byType[a.type][1]])[0],
})

export function AccountIcon({ account, className }: { account: Pick<Account, "icon" | "color" | "type">; className?: string }) {
  const { Icon, tone } = iconOf(account)
  return (
    <span aria-hidden="true" className={cn("grid size-9 shrink-0 place-items-center rounded-sm", tone, className)}>
      <Icon className="size-[55%]" />
    </span>
  )
}

// IconButton shows an account's icon; tapping it opens a picker that saves on every choice.
export function IconButton({ account, onSaved }: { account: Account; onSaved: (a: Account) => void }) {
  const t = useT()
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<FormError>({})
  const { Icon } = iconOf(account)
  const color = colors[account.color] ? account.color : byType[account.type][1]

  async function save(body: { icon?: string; color?: string }) {
    setErr({})
    try {
      onSaved(await updateAccount(account.id, body))
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("acct.changeIcon", { name: account.name })}
        className="rounded-sm focus-visible:ring-2 focus-visible:ring-primary">
        <AccountIcon account={account} />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={mobile ? "bottom" : "right"} title={t("acct.iconTitle", { name: account.name })}>
          <div className="grid gap-4 pb-2">
            <Status err={err} ok="" />
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("acct.color")}</legend>
              <div className="flex flex-wrap gap-2">
                {Object.entries(colors).map(([name, [, swatch]]) => (
                  <button key={name} type="button" aria-label={name} aria-pressed={name === color} onClick={() => save({ color: name })}
                    className={cn("size-9 rounded-full ring-offset-2", swatch, name === color && "ring-2 ring-foreground")} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("acct.icon")}</legend>
              <div className="grid grid-cols-6 gap-2">
                {Object.entries(icons).map(([name, I]) => (
                  <button key={name} type="button" aria-label={name} aria-pressed={I === Icon} onClick={() => save({ icon: name })}
                    className={cn("grid aspect-square place-items-center rounded-sm border hover:bg-muted",
                      I === Icon && cn("border-transparent", colors[color][0]))}>
                    <I className="size-5" />
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
