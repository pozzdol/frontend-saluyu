import { useEffect, useState } from "preact/hooks"
import { AppShell } from "@/components/app-shell"
import { LinesEdit } from "@/components/entry-detail"
import { Status, toFormError, type FormError } from "@/components/field"
import { toast } from "@/components/toast"
import { Card, CardContent } from "@/components/ui/card"
import { listAccounts, postJournal, type Account } from "@/lib/api"
import { useT } from "@/lib/i18n"

// JournalPage records a manual multi-line entry: debits and credits written out by hand,
// for what no form covers (and for corrections of closed periods).
export function JournalPage() {
  const t = useT()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [err, setErr] = useState<FormError>({})
  const [round, setRound] = useState(0) // a fresh, empty form after each save
  useEffect(() => {
    listAccounts().then(setAccounts, (e) => setErr(toFormError(e)))
  }, [])
  return (
    <AppShell title={t("nav.journal")} term="journal">
      <div className="grid max-w-2xl gap-4">
        <p className="text-sm text-muted-foreground">{t("jrn.intro")}</p>
        <Status err={err} ok="" />
        <Card className="rounded-sm"><CardContent>
          <LinesEdit key={round} accounts={accounts} onDone={() => setRound((n) => n + 1)}
            save={async (body) => {
              const e = await postJournal(body)
              toast(t("jrn.saved", { no: e.entry_no }))
            }} />
        </CardContent></Card>
      </div>
    </AppShell>
  )
}
