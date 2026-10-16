import { AlertCircle, Check, CheckCircle2, Loader2 } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { Field, formValues, toFormError, type FormError } from "@/components/field"
import { Logo } from "@/components/site"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError, acceptInviteLink, forgotPassword, login, loginTOTP, register, resetPassword, useAuth, verifyEmail } from "@/lib/api"
import { useT } from "@/lib/i18n"
import { useEntrance } from "@/lib/motion"

// safeNext is ?next= when it is a path on this site (never another origin).
export function safeNext() {
  const next = new URLSearchParams(location.search).get("next")
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null
}

// AuthLayout is the shared frame of every signed-out page: brand panel on desktop, form on the right.
function AuthLayout({ title, hint, err, children }: { title: string; hint?: string; err?: FormError; children: ComponentChildren }) {
  const t = useT()
  // The brand panel rises in once; the form side again on each new step (password, then 2FA).
  const brand = useEntrance<HTMLDivElement>()
  const form = useEntrance<HTMLDivElement>(title)
  return (
    <div className="grid min-h-svh md:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0052d9] via-[#1f66e5] to-[#5b95ff] p-8 text-white md:flex md:flex-col lg:p-12">
        <div className="[&_a]:text-white [&_span]:bg-white [&_span]:text-primary">
          <Logo />
        </div>
        <div ref={brand} className="mt-auto max-w-md">
          <h2 data-enter className="text-3xl font-bold tracking-tight">{t("brand.tagline")}</h2>
          <ul className="mt-6 space-y-3 text-sm text-white/85">
            {[t("auth.perk1"), t("auth.perk2"), t("auth.perk3")].map((perk) => (
              <li key={perk} data-enter className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0" />
                {perk}
              </li>
            ))}
          </ul>
        </div>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute top-24 -right-10 size-40 rounded-full bg-white/10" />
      </aside>

      <main className="flex flex-col bg-gradient-to-b from-[#eaf2ff] to-white px-4 py-10 md:bg-none">
        <div className="md:hidden">
          <Logo />
        </div>
        <div ref={form} className="mx-auto mt-10 w-full max-w-sm sm:my-auto">
          <h1 data-enter className="text-2xl font-semibold tracking-tight">{title}</h1>
          {hint && <p data-enter className="mt-1 text-sm text-muted-foreground">{hint}</p>}
          {err?.message && (
            <Alert variant="destructive" className="mt-6 rounded-sm">
              <AlertCircle />
              <AlertDescription>{err.message}</AlertDescription>
            </Alert>
          )}
          <div data-enter>{children}</div>
        </div>
      </main>
    </div>
  )
}

function Done({ children }: { children: ComponentChildren }) {
  return (
    <Alert className="mt-6 rounded-sm border-emerald-200 bg-emerald-50 text-emerald-900">
      <CheckCircle2 />
      <AlertDescription className="text-emerald-900">{children}</AlertDescription>
    </Alert>
  )
}

// useSubmit runs one submit at a time and keeps its error.
function useSubmit(run: (v: Record<string, string>) => Promise<void>) {
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)
  async function onSubmit(e: SubmitEvent) {
    const v = formValues(e)
    setBusy(true)
    setErr({})
    try {
      await run(v)
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }
  return { err, setErr, busy, onSubmit }
}

function Submit({ busy, children }: { busy: boolean; children: ComponentChildren }) {
  return (
    <Button type="submit" disabled={busy} className="mt-2 h-10 rounded-sm">
      {busy && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  )
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const t = useT()
  const isLogin = mode === "login"
  const { user } = useAuth()
  const { route } = useLocation()
  // Set when the password was right and the account wants a 2FA code next.
  const [mfa, setMfa] = useState("")
  const [backup, setBackup] = useState(false)

  const form = useSubmit(async (v) => {
    if (!isLogin) await register({ name: v.name, email: v.email, password: v.password })
    const res = await login({ email: v.email, password: v.password })
    if (res.mfaToken) setMfa(res.mfaToken)
  })
  const second = useSubmit(async (v) => {
    try {
      await loginTOTP({ mfa_token: mfa, code: v.code })
    } catch (e) {
      // The ticket lasts 5 minutes; after that the password step starts over.
      if (e instanceof ApiError && e.code === "mfa_expired") setMfa("")
      throw e
    }
  })

  useEffect(() => {
    if (user) route(safeNext() ?? "/app/dashboard", true)
  }, [user])
  useEffect(() => (form.setErr({}), setMfa("")), [mode])

  if (mfa) {
    return (
      <AuthLayout title={t("auth.mfaTitle")} hint={backup ? t("auth.backupHint") : t("auth.mfaHint")} err={second.err}>
        <form onSubmit={second.onSubmit} className="mt-6 grid gap-4" noValidate>
          <Field
            key={backup ? "backup" : "app"}
            name="code"
            label={backup ? t("auth.backupCode") : t("auth.mfaCode")}
            autoComplete="one-time-code"
            inputMode={backup ? "text" : "numeric"}
            placeholder={backup ? "abcde-fghij" : "123456"}
            error={second.err.fields?.code}
            required
          />
          <Submit busy={second.busy}>{t("auth.signInTitle")}</Submit>
        </form>
        <div className="mt-6 flex justify-between text-sm">
          <button type="button" className="text-primary hover:underline" onClick={() => (setBackup(!backup), second.setErr({}))}>
            {backup ? t("auth.useApp") : t("auth.useBackup")}
          </button>
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMfa("")}>{t("common.back")}</button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={isLogin ? t("auth.signInTitle") : t("auth.registerTitle")} hint={isLogin ? t("auth.signInHint") : t("auth.registerHint")} err={form.err}>
      <form onSubmit={form.onSubmit} className="mt-6 grid gap-4" noValidate>
        {!isLogin && <Field name="name" label={t("auth.fullName")} autoComplete="name" error={form.err.fields?.name} required />}
        <Field name="email" label={t("auth.email")} type="email" autoComplete="email" error={form.err.fields?.email} required />
        <Field
          name="password"
          label={t("auth.password")}
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          placeholder={isLogin ? undefined : t("auth.passwordHint")}
          error={form.err.fields?.password}
          required
        />
        {isLogin && (
          <a href="/forgot-password" className="-mt-2 justify-self-end text-sm text-primary hover:underline">{t("auth.forgot")}</a>
        )}
        <Submit busy={form.busy}>{isLogin ? t("auth.signInTitle") : t("auth.createAccount")}</Submit>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isLogin ? t("auth.newHere") : t("auth.haveAccount")}
        <a href={isLogin ? "/register" : "/login"} className="font-medium text-primary hover:underline">
          {isLogin ? t("auth.createLink") : t("auth.signInTitle")}
        </a>
      </p>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const t = useT()
  const [sent, setSent] = useState(false)
  const form = useSubmit(async (v) => {
    await forgotPassword(v.email)
    setSent(true)
  })
  return (
    <AuthLayout title={t("auth.forgotTitle")} hint={t("auth.forgotHint")} err={form.err}>
      {sent ? (
        <Done>{t("auth.linkSent")}</Done>
      ) : (
        <form onSubmit={form.onSubmit} className="mt-6 grid gap-4" noValidate>
          <Field name="email" label={t("auth.email")} type="email" autoComplete="email" error={form.err.fields?.email} required />
          <Submit busy={form.busy}>{t("auth.sendLink")}</Submit>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <a href="/login" className="text-primary hover:underline">{t("auth.backToLogin")}</a>
      </p>
    </AuthLayout>
  )
}

// linkToken reads ?token= once and removes it from the address bar, so it does not stay in
// history or leak through a Referer header.
function useLinkToken() {
  const [token] = useState(() => new URLSearchParams(location.search).get("token") ?? "")
  useEffect(() => history.replaceState(null, "", location.pathname), [])
  return token
}

export function ResetPasswordPage() {
  const t = useT()
  const token = useLinkToken()
  const [done, setDone] = useState(false)
  const form = useSubmit(async (v) => {
    if (v.new_password !== v.confirm) {
      form.setErr({ fields: { confirm: t("auth.mismatch") } })
      return
    }
    await resetPassword({ token, new_password: v.new_password })
    setDone(true)
  })
  return (
    <AuthLayout title={t("auth.resetTitle")} hint={done ? undefined : t("auth.resetHint")} err={form.err}>
      {done ? (
        <>
          <Done>{t("auth.resetDone")}</Done>
          <Button asChild className="mt-4 h-10 w-full rounded-sm"><a href="/login">{t("auth.signInTitle")}</a></Button>
        </>
      ) : !token ? (
        <p className="mt-6 text-sm">{t("errors.invalid_link")} <a href="/forgot-password" className="text-primary hover:underline">{t("auth.sendLink")}</a></p>
      ) : (
        <form onSubmit={form.onSubmit} className="mt-6 grid gap-4" noValidate>
          <Field name="new_password" label={t("prof.newPw")} type="password" autoComplete="new-password" placeholder={t("auth.passwordHint")} error={form.err.fields?.new_password} required />
          <Field name="confirm" label={t("auth.confirmPassword")} type="password" autoComplete="new-password" error={form.err.fields?.confirm} required />
          <Submit busy={form.busy}>{t("auth.resetTitle")}</Submit>
        </form>
      )}
    </AuthLayout>
  )
}

export function VerifyEmailPage() {
  const t = useT()
  const token = useLinkToken()
  const { user } = useAuth()
  const [state, setState] = useState<"busy" | "done" | FormError>("busy")
  useEffect(() => {
    if (!token) return setState({ message: t("errors.invalid_link") })
    verifyEmail(token).then(() => setState("done"), (e) => setState(toFormError(e)))
  }, [])
  return (
    <AuthLayout title={t("auth.verifyTitle")} err={typeof state === "object" ? state : undefined}>
      {state === "busy" && <Loader2 className="mt-6 size-5 animate-spin text-muted-foreground" />}
      {state === "done" && <Done>{t("auth.verified")}</Done>}
      <Button asChild variant={state === "done" ? "default" : "outline"} className="mt-4 h-10 w-full rounded-sm">
        <a href={user ? "/app/dashboard" : "/login"}>{user ? t("auth.goToApp") : t("auth.signInTitle")}</a>
      </Button>
    </AuthLayout>
  )
}

// JoinPage accepts a group invite link. A signed-out visitor signs in first and comes back
// here through ?next=, token and all.
export function JoinPage() {
  const t = useT()
  const { user, ready } = useAuth()
  const [token] = useState(() => new URLSearchParams(location.search).get("token") ?? "")
  const [state, setState] = useState<"idle" | "busy" | "done" | FormError>("idle")
  useEffect(() => {
    if (!token) return setState({ message: t("errors.invalid_link") })
    if (!user || state !== "idle") return
    setState("busy")
    acceptInviteLink(token).then(() => setState("done"), (e) => setState(toFormError(e)))
  }, [user?.id])
  const back = encodeURIComponent(`/join?token=${token}`)
  return (
    <AuthLayout title={t("join.title")} err={typeof state === "object" ? state : undefined}>
      {ready && !user && token && (
        <>
          <p className="mt-4 text-sm text-muted-foreground">{t("join.signIn")}</p>
          <div className="mt-4 grid gap-2">
            <Button asChild className="h-10 rounded-sm"><a href={`/login?next=${back}`}>{t("auth.signInTitle")}</a></Button>
            <Button asChild variant="outline" className="h-10 rounded-sm"><a href={`/register?next=${back}`}>{t("auth.createAccount")}</a></Button>
          </div>
        </>
      )}
      {state === "busy" && <p className="mt-6 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> {t("join.joining")}</p>}
      {state === "done" && <Done>{t("join.joined")}</Done>}
      {user && state !== "busy" && (
        <Button asChild className="mt-4 h-10 w-full rounded-sm"><a href="/app/groups">{t("join.open")}</a></Button>
      )}
    </AuthLayout>
  )
}
