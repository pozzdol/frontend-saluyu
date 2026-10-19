import { useEffect, useState } from "preact/hooks"
import { Status, toFormError, type FormError } from "@/components/field"
import { toast } from "@/components/toast"
import { Switch } from "@/components/ui/switch"
import { getNotifyPrefs, putNotifyPrefs, type NotifyPrefs, type User } from "@/lib/api"
import { useT, type Key } from "@/lib/i18n"

const kinds: [keyof NotifyPrefs, Key, Key][] = [
  ["due_bills", "notify.dueBills", "notify.dueBillsHint"],
  ["budget", "notify.budget", "notify.budgetHint"],
  ["weekly", "notify.weekly", "notify.weeklyHint"],
  ["inactive", "notify.inactive", "notify.inactiveHint"],
]

// Reminders is the four email switches; each change saves at once.
export function Reminders({ user }: { user: User }) {
  const t = useT()
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null)
  const [err, setErr] = useState<FormError>({})
  useEffect(() => void getNotifyPrefs().then(setPrefs, (e) => setErr(toFormError(e))), [])

  async function toggle(key: keyof NotifyPrefs, on: boolean) {
    if (!prefs) return
    try {
      setPrefs(await putNotifyPrefs({ ...prefs, [key]: on }))
      setErr({})
      toast(t("notify.saved"))
    } catch (e) {
      setErr(toFormError(e))
    }
  }

  return (
    <section className="grid gap-3">
      <h3 className="font-medium">{t("notify.title")}</h3>
      <p className="text-xs text-muted-foreground">{t("notify.hint")}</p>
      {!user.email_verified && <p className="rounded-sm border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t("notify.unverified")}</p>}
      <Status err={err} ok="" />
      {prefs &&
        kinds.map(([key, label, hint]) => (
          <label key={key} className="flex items-start justify-between gap-3 text-sm">
            <span>
              <span className="block font-medium">{t(label)}</span>
              <span className="block text-xs text-muted-foreground">{t(hint)}</span>
            </span>
            <Switch checked={prefs[key]} onCheckedChange={(on) => toggle(key, on)} />
          </label>
        ))}
    </section>
  )
}
