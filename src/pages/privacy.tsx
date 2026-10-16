import { Download, EyeOff, Loader2, Users, UserRound } from "lucide-react"
import { useState } from "preact/hooks"
import { AppShell } from "@/components/app-shell"
import { Status, toFormError, type FormError } from "@/components/field"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { downloadExport } from "@/lib/api"
import { useT, type Key } from "@/lib/i18n"

// Who sees what, in the same words as the Groups page, then the full data download.
const rows: { icon: typeof Users; title: Key; body: Key }[] = [
  { icon: UserRound, title: "priv.youTitle", body: "priv.youBody" },
  { icon: Users, title: "priv.groupTitle", body: "priv.groupBody" },
  { icon: EyeOff, title: "priv.neverTitle", body: "priv.neverBody" },
]

export function PrivacyPage() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})

  async function download() {
    setBusy(true)
    setErr({})
    try {
      await downloadExport()
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell title={t("priv.title")}>
      <div className="grid max-w-3xl gap-6">
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t("priv.whoSees")}</h2>
          {rows.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="rounded-sm">
              <CardContent className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h3 className="font-medium">{t(title)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(body)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t("priv.yourData")}</h2>
          <p className="text-sm text-muted-foreground">{t("priv.exportHint")}</p>
          <Status err={err} ok="" />
          <Button className="h-11 justify-self-start rounded-sm" disabled={busy} onClick={download}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {t("priv.download")}
          </Button>
        </section>
      </div>
    </AppShell>
  )
}
