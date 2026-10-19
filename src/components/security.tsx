import { Check, Copy, Download, Laptop, Loader2, ShieldCheck, Smartphone } from "lucide-react"
import { useEffect, useState } from "preact/hooks"
import { renderSVG } from "uqr"
import { Field, Status, toFormError, useForm, type FormError } from "@/components/field"
import { toast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { disableTOTP, enableTOTP, endSession, listSessions, revokeOtherSessions, setupTOTP, type SessionInfo, type User } from "@/lib/api"
import { intlLocale, useT } from "@/lib/i18n"
import { Loading, Skeleton } from "@/components/skeleton"

// device turns a User-Agent into "Chrome · Android". Good enough to recognise your own devices.
function device(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : ""
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows"
    : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : ""
  return { name: [browser, os].filter(Boolean).join(" · "), phone: /Android|iPhone|iPad|Mobile/.test(ua) }
}

function ago(iso: string) {
  const sec = (Date.parse(iso) - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto" })
  for (const [unit, s] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(sec) >= s) return rtf.format(Math.round(sec / s), unit)
  }
  return rtf.format(0, "minute")
}

export function Sessions() {
  const t = useT()
  const [list, setList] = useState<SessionInfo[] | null>(null)
  const [err, setErr] = useState<FormError>({})
  const [busy, setBusy] = useState("")
  const load = () => listSessions().then(setList, (e) => setErr(toFormError(e)))
  useEffect(() => void load(), [])

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id)
    setErr({})
    try {
      await fn()
      await load()
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy("")
    }
  }

  const others = list?.filter((s) => !s.current).length ?? 0
  return (
    <section className="grid gap-3">
      <h3 className="font-medium">{t("sec.sessions")}</h3>
      <Status err={err} ok="" />
      {!list && !err.message && (
        <Loading className="gap-0 divide-y rounded-sm border">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="size-5 shrink-0" />
              <div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div>
            </div>
          ))}
        </Loading>
      )}
      <ul className="divide-y rounded-sm border">
        {list?.map((s) => {
          const d = device(s.user_agent)
          const Icon = d.phone ? Smartphone : Laptop
          return (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name || t("sec.unknownDevice")}</p>
                <p className="text-xs text-muted-foreground">
                  {s.current ? <span className="font-medium text-emerald-700">{t("sec.thisDevice")}</span> : t("sec.lastActive", { when: ago(s.last_active) })}
                </p>
              </div>
              {!s.current && (
                <Button variant="ghost" size="sm" disabled={busy === s.id} onClick={() => run(s.id, () => endSession(s.id))}>
                  {busy === s.id && <Loader2 className="animate-spin" />}
                  {t("sec.signOut")}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {others > 0 && (
        <Button variant="outline" className="rounded-sm" disabled={busy === "all"} onClick={() => run("all", revokeOtherSessions)}>
          {busy === "all" && <Loader2 className="animate-spin" />}
          {t("sec.signOutOthers")}
        </Button>
      )}
    </section>
  )
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useT()
  const text = codes.join("\n")
  const download = () => {
    const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }))
    Object.assign(document.createElement("a"), { href: url, download: "saluyu-backup-codes.txt" }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm">{t("sec.backupIntro")}</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-sm bg-muted p-3 font-mono text-sm">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="rounded-sm"
          onClick={() => navigator.clipboard.writeText(text).then(() => toast(t("sec.copied")), () => toast(t("sec.copyFailed"), { tone: "error" }))}>
          <Copy /> {t("sec.copy")}
        </Button>
        <Button variant="outline" size="sm" className="rounded-sm" onClick={download}><Download /> {t("sec.download")}</Button>
        <Button size="sm" className="ml-auto rounded-sm" onClick={onDone}><Check /> {t("sec.saved")}</Button>
      </div>
    </div>
  )
}

export function TwoFactor({ user }: { user: User }) {
  const t = useT()
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [disabling, setDisabling] = useState(false)
  const [err, setErr] = useState<FormError>({})

  const enable = useForm(async (v) => {
    setCodes(await enableTOTP(v.code))
    setSetup(null)
    return ""
  })
  const disable = useForm(async (v) => {
    await disableTOTP({ password: v.password, code: v.code })
    setDisabling(false)
    return t("sec.disabled")
  })

  async function start() {
    setErr({})
    try {
      setSetup(await setupTOTP())
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  return (
    <section className="grid gap-3">
      <h3 className="flex items-center gap-2 font-medium">
        {t("sec.twoFactor")}
        {user.totp_enabled && <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">{t("common.active")}</span>}
      </h3>
      <p className="text-sm text-muted-foreground">{t("sec.twoFactorHint")}</p>
      <Status err={err} ok={disable.ok} />

      {codes ? (
        <BackupCodes codes={codes} onDone={() => setCodes(null)} />
      ) : setup ? (
        <form onSubmit={enable.onSubmit} noValidate className="grid gap-3">
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            <li>{t("sec.step1")}</li>
            <li>{t("sec.step2")}</li>
          </ol>
          {/* uqr builds the SVG from our own otpauth URI, so the markup is ours */}
          <div className="size-44 justify-self-center rounded-sm border bg-white p-2 [&_svg]:size-full" aria-label={t("sec.qr")} role="img"
            dangerouslySetInnerHTML={{ __html: renderSVG(setup.uri) }} />
          <p className="text-center text-xs text-muted-foreground">
            {t("sec.manual")} <code className="block break-all font-mono text-sm text-foreground select-all">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </p>
          <Status err={enable.err} ok="" />
          <Field name="code" label={t("auth.mfaCode")} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" error={enable.err.fields?.code} />
          <div className="flex gap-2">
            <Button type="submit" disabled={enable.busy} className="rounded-sm">
              {enable.busy && <Loader2 className="animate-spin" />}
              {t("sec.turnOn")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSetup(null)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : !user.totp_enabled ? (
        <Button variant="outline" className="justify-self-start rounded-sm" onClick={start}><ShieldCheck /> {t("sec.setUp")}</Button>
      ) : disabling ? (
        <form onSubmit={disable.onSubmit} noValidate className="grid gap-3">
          <Status err={disable.err} ok="" />
          <Field name="password" label={t("prof.currentPw")} type="password" autoComplete="current-password" error={disable.err.fields?.password} />
          <Field name="code" label={t("sec.codeOrBackup")} autoComplete="one-time-code" error={disable.err.fields?.code} />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={disable.busy}>
              {disable.busy && <Loader2 className="animate-spin" />}
              {t("sec.turnOff")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDisabling(false)}>{t("common.cancel")}</Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" className="justify-self-start text-rose-700" onClick={() => setDisabling(true)}>{t("sec.turnOff")}</Button>
      )}
    </section>
  )
}
