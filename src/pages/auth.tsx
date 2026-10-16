import { AlertCircle, Check, Loader2 } from "lucide-react"
import { useLocation } from "preact-iso"
import { useEffect, useState } from "preact/hooks"
import { Field, formValues, toFormError, type FormError } from "@/components/field"
import { Logo } from "@/components/site"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { login, register, useAuth } from "@/lib/api"

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login"
  const { user } = useAuth()
  const { route } = useLocation()
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user) route("/app/dashboard", true)
  }, [user])
  useEffect(() => setErr({}), [mode])

  async function onSubmit(e: SubmitEvent) {
    const v = formValues(e)
    setBusy(true)
    setErr({})
    try {
      if (!isLogin) await register({ name: v.name, email: v.email, password: v.password })
      await login({ email: v.email, password: v.password })
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0052d9] via-[#1f66e5] to-[#5b95ff] p-12 text-white lg:flex lg:flex-col">
        <div className="[&_a]:text-white [&_span]:bg-white [&_span]:text-primary">
          <Logo />
        </div>
        <div className="mt-auto max-w-md">
          <h2 className="text-3xl font-bold tracking-tight">One ledger, every account in balance.</h2>
          <ul className="mt-6 space-y-3 text-sm text-white/85">
            {[
              "Short-lived access tokens kept in memory only",
              "Refresh sessions in HttpOnly, SameSite=Strict cookies",
              "Changing your password signs out every other device",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute top-24 -right-10 size-40 rounded-full bg-white/10" />
      </aside>

      <main className="flex flex-col bg-gradient-to-b from-[#eaf2ff] to-white px-4 py-10 lg:bg-none">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="m-auto w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? "Sign in" : "Create your workspace"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLogin ? "Welcome back. Enter your email and password." : "Free for 3 months. No card required."}
          </p>

          {err.message && (
            <Alert variant="destructive" className="mt-6 rounded-sm">
              <AlertCircle />
              <AlertDescription>{err.message}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
            {!isLogin && <Field name="name" label="Full name" autoComplete="name" error={err.fields?.name} required />}
            <Field name="email" label="Email" type="email" autoComplete="email" error={err.fields?.email} required />
            <Field
              name="password"
              label="Password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder={isLogin ? undefined : "At least 6 characters"}
              error={err.fields?.password}
              required
            />
            <Button type="submit" disabled={busy} className="mt-2 h-10 rounded-sm">
              {busy && <Loader2 className="animate-spin" />}
              {isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isLogin ? "New to Saluyu? " : "Already have an account? "}
            <a href={isLogin ? "/register" : "/login"} className="font-medium text-primary hover:underline">
              {isLogin ? "Create an account" : "Sign in"}
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
