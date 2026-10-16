import { KeyRound, Loader2, LogOut, Shield, UserRound } from "lucide-react"
import { useState } from "preact/hooks"
import { Field, Status, toFormError, useForm, type FormError } from "@/components/field"
import { Label } from "@/components/ui/label"
import { AppShell } from "@/components/app-shell"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ApiError, changePassword, logout, updateProfile, type User } from "@/lib/api"
import { toast } from "@/components/toast"
import { DayOfMonthPicker, SelectPicker } from "@/components/picker"
import { useT } from "@/lib/i18n"
import { Sessions, TwoFactor } from "@/components/security"

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

// PaydayField picks the day each budget period starts; the hidden input feeds the profile form.
function PaydayField({ day, error }: { day: number; error?: string }) {
  const t = useT()
  const [value, setValue] = useState(day)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="period_start_day">{t("prof.payday")}</Label>
      <DayOfMonthPicker id="period_start_day" value={value} onChange={setValue} />
      <input type="hidden" name="period_start_day" value={String(value)} />
      {error && <p className="text-xs text-destructive">{error[0].toUpperCase() + error.slice(1)}</p>}
    </div>
  )
}

// LanguageField saves on change: the whole page switches language at once.
function LanguageField({ user }: { user: User }) {
  const t = useT()
  const [err, setErr] = useState<FormError>({})
  return (
    <div className="grid gap-1.5">
      <Label>{t("prof.language")}</Label>
      <SelectPicker
        aria-label={t("prof.language")}
        title={t("prof.language")}
        value={user.locale ?? "auto"}
        onChange={(v) => updateProfile({ locale: v as "id" | "en" | "auto" }).then(() => setErr({}), (e) => setErr(toFormError(e)))}
        options={[
          { value: "auto", label: t("prof.auto") },
          { value: "id", label: "Bahasa Indonesia" },
          { value: "en", label: "English" },
        ]}
      />
      <p className="text-xs text-muted-foreground">{t("prof.languageHint")}</p>
      <Status err={err} ok="" />
    </div>
  )
}

export function Account({ user }: { user: User }) {
  const t = useT()
  const profile = useForm(async (v) => {
    // Send only changed fields: the API treats a missing field as "leave as is".
    const body: { name?: string; img_url?: string; period_start_day?: number } = {}
    if (v.name !== user.name) body.name = v.name
    if (v.img_url !== user.img_url) body.img_url = v.img_url
    if (Number(v.period_start_day) !== user.period_start_day) body.period_start_day = Number(v.period_start_day)
    // Feedback as a toast: "nothing changed" is information, not a green success box.
    if (Object.keys(body).length === 0) return toast(t("common.nothingToUpdate")), ""
    await updateProfile(body)
    toast(t("prof.saved"))
    return ""
  })

  const password = useForm(async (v, form) => {
    try {
      await changePassword({ old_password: v.old_password, new_password: v.new_password })
    } catch (e) {
      // A wrong current password belongs under that field, not in a banner above the form.
      if (e instanceof ApiError && e.code === "wrong_password") throw new ApiError(400, "validation failed", undefined, "validation", { old_password: "wrongPassword" })
      throw e
    }
    form.reset()
    toast(t("prof.pwChanged"))
    return ""
  })

  const [leaving, setLeaving] = useState(false)

  return (
    <AppShell title={t("prof.title")}>
      <section className="mb-6 rounded-sm border bg-card">
        <div className="flex flex-wrap items-center gap-4 p-4 md:gap-5 md:p-6">
          <Avatar className="size-16 rounded-sm ring-4 ring-white">
            <AvatarImage src={user.img_url || undefined} alt="" className="rounded-sm object-cover" />
            <AvatarFallback className="rounded-sm bg-primary text-lg font-semibold text-primary-foreground">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">{user.name}</h2>
              <Badge className="rounded-sm bg-emerald-100 text-emerald-700">{user.is_active ? t("common.active") : t("common.inactive")}</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button
            variant="outline"
            className="w-full rounded-sm bg-white md:ml-auto md:w-auto"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true)
              await logout().catch(() => {}) // local session is cleared either way
            }}
          >
            {leaving ? <Loader2 className="animate-spin" /> : <LogOut />}
            {t("prof.signOut")}
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" /> {t("prof.title")}
            </CardTitle>
            <CardDescription>{t("prof.profileHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={profile.onSubmit} className="grid gap-4" noValidate>
              <Status {...profile} />
              <Field name="name" label={t("auth.fullName")} defaultValue={user.name} error={profile.err.fields?.name} />
              <Field
                name="img_url"
                label={t("prof.avatar")}
                type="url"
                placeholder="https://…"
                defaultValue={user.img_url}
                error={profile.err.fields?.img_url}
              />
              <PaydayField day={user.period_start_day} error={profile.err.fields?.period_start_day} />
              <p className="-mt-2 text-xs text-muted-foreground">
                {t("prof.paydayHint")}
              </p>
              <Field name="email" label={t("prof.emailFixed")} defaultValue={user.email} type="email" disabled />
              <Button type="submit" disabled={profile.busy} className="h-10 rounded-sm">
                {profile.busy && <Loader2 className="animate-spin" />}
                {t("prof.save")}
              </Button>
            </form>
            <div className="mt-6 border-t pt-6"><LanguageField user={user} /></div>
          </CardContent>
        </Card>

        <Card className="rounded-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> {t("prof.security")}
            </CardTitle>
            <CardDescription>{t("prof.securityHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={password.onSubmit} className="grid gap-4" noValidate>
              <Status {...password} />
              <Field
                name="old_password"
                label={t("prof.currentPw")}
                type="password"
                autoComplete="current-password"
                error={password.err.fields?.old_password}
              />
              <Field
                name="new_password"
                label={t("prof.newPw")}
                type="password"
                autoComplete="new-password"
                placeholder={t("auth.passwordHint")}
                error={password.err.fields?.new_password}
              />
              <Button type="submit" disabled={password.busy} className="h-10 rounded-sm">
                {password.busy && <Loader2 className="animate-spin" />}
                {t("prof.changePw")}
              </Button>
            </form>
            <div className="mt-6 grid gap-6 border-t pt-6">
              <TwoFactor user={user} />
              <Sessions />
              <a href="/app/privacy" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                <Shield className="size-4" /> {t("priv.open")}
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
