import type { ComponentType } from "preact"
import { LocationProvider, Route, Router, useLocation } from "preact-iso"
import { useEffect } from "preact/hooks"
import { useAuth, type User } from "@/lib/api"
import { Landing } from "@/pages/landing"
import { AuthPage, ForgotPasswordPage, JoinPage, ResetPasswordPage, VerifyEmailPage } from "@/pages/auth"
import { Account } from "@/pages/account"
import { Transactions } from "@/pages/transactions"
import { Accounts } from "@/pages/accounts"
import { LedgerPage } from "@/pages/ledger"
import { TrialBalancePage } from "@/pages/trial-balance"
import { OpeningPage } from "@/pages/opening"
import { ReconcilePage } from "@/pages/reconcile"
import { DashboardPage } from "@/pages/dashboard"
import { BudgetsPage } from "@/pages/budgets"
import { ReportsPage } from "@/pages/reports"
import { ContactPage, ContactsPage } from "@/pages/contacts"
import { GroupsPage } from "@/pages/groups"
import { WelcomePage } from "@/pages/welcome"
import { CardPage, CardsPage, PlanPage } from "@/pages/cards"
import { RecurringPage } from "@/pages/recurring"
import { JournalPage } from "@/pages/journal"
import { ImportPage } from "@/pages/import"
import { PrivacyPage } from "@/pages/privacy"
import { browserLocale, setLocale, t, useT } from "@/lib/i18n"
import { flush } from "@/lib/outbox"
import { toast } from "@/components/toast"
import { toFormError } from "@/components/field"
import { Logo } from "@/components/site"

// protect renders a page only for a signed-in user and sends everyone else to /login.
function protect<P>(Page: ComponentType<P & { user: User }>) {
  return function Protected(props: P) {
    const { user, ready } = useAuth()
    const { route, path } = useLocation()
    // Books must be opened before anything else in the console makes sense.
    const needsOpening = !!user && !user.start_date && path.startsWith("/app") && path !== "/app/opening" && path !== "/app/welcome"
    // The wizard is for opening the books once. Finishing it again would replace the opening
    // balances with only what it asked for, so open books skip it.
    const alreadyOpen = !!user?.start_date && path === "/app/welcome"
    useEffect(() => {
      if (ready && !user) route("/login", true)
      else if (needsOpening) route("/app/welcome", true)
      else if (alreadyOpen) route("/app/dashboard", true)
    }, [ready, user, needsOpening, alreadyOpen])
    return user && !needsOpening && !alreadyOpen ? <Page {...props} user={user} /> : null
  }
}

function Redirect({ to }: { to: string }) {
  const { route } = useLocation()
  useEffect(() => route(to, true), [])
  return null
}

function NotFound() {
  const t = useT()
  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr] px-4 py-6 text-center">
      <div className="justify-self-start"><Logo /></div>
      <div className="self-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold">{t("common.pageNotFound")}</h1>
        <a href="/" className="mt-4 inline-block text-sm text-primary hover:underline">{t("common.backHome")}</a>
      </div>
    </div>
  )
}

const AccountPage = protect(Account)
const TransactionsPage = protect(Transactions)
const AccountsPage = protect(Accounts)
const Ledger = protect(({ params }: { params: { id: string } }) => <LedgerPage id={params.id} />)
const TrialBalance = protect(TrialBalancePage)
const Opening = protect(OpeningPage)
const Reconcile = protect(ReconcilePage)
const Dashboard = protect(DashboardPage)
const Budgets = protect(BudgetsPage)
const Reports = protect(ReportsPage)
const Contacts = protect(ContactsPage)
const Groups = protect(GroupsPage)
const Welcome = protect(WelcomePage)
const Cards = protect(CardsPage)
const Recurring = protect(RecurringPage)
const Journal = protect(JournalPage)
const Import = protect(ImportPage)
const CardDetail = protect(({ params }: { params: { id: string } }) => <CardPage id={params.id} />)
const PlanDetail = protect(({ params }: { params: { id: string } }) => <PlanPage id={params.id} />)
const Privacy = protect(PrivacyPage)
const ContactDetail = protect(({ params }: { params: { id: string } }) => <ContactPage id={params.id} />)

// LocaleSync follows the user's saved language, or the browser's when none is saved.
function LocaleSync() {
  const { user } = useAuth()
  useEffect(() => setLocale(user?.locale ?? browserLocale()), [user?.locale])
  return null
}

// OutboxSync sends Quick Add entries kept offline, now and whenever the connection is back.
function OutboxSync() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user) return
    const go = () =>
      flush().then(({ sent, refused }) => {
        if (sent) toast(t("qa.synced", { n: sent }))
        for (const e of refused) toast(toFormError(e).message ?? "", { tone: "error" })
      })
    go()
    window.addEventListener("online", go)
    return () => window.removeEventListener("online", go)
  }, [user?.id])
  return null
}

export function App() {
  return (
    <LocationProvider>
      <LocaleSync />
      <OutboxSync />
      <Router>
        <Route path="/" component={Landing} />
        <Route path="/login" component={() => <AuthPage mode="login" />} />
        <Route path="/register" component={() => <AuthPage mode="register" />} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/join" component={JoinPage} />
        <Route path="/account" component={AccountPage} />
        <Route path="/app" component={() => <Redirect to="/app/dashboard" />} />
        <Route path="/app/dashboard" component={Dashboard} />
        <Route path="/app/budgets" component={Budgets} />
        <Route path="/app/reports" component={Reports} />
        <Route path="/app/transactions" component={TransactionsPage} />
        <Route path="/app/accounts" component={AccountsPage} />
        <Route path="/app/accounts/:id" component={Ledger} />
        <Route path="/app/trial-balance" component={TrialBalance} />
        <Route path="/app/opening" component={Opening} />
        <Route path="/app/welcome" component={Welcome} />
        <Route path="/app/cards" component={Cards} />
        <Route path="/app/recurring" component={Recurring} />
        <Route path="/app/journal" component={Journal} />
        <Route path="/app/import" component={Import} />
        <Route path="/app/cards/:id" component={CardDetail} />
        <Route path="/app/installments/:id" component={PlanDetail} />
        <Route path="/app/privacy" component={Privacy} />
        <Route path="/app/reconcile" component={Reconcile} />
        <Route path="/app/contacts" component={Contacts} />
        <Route path="/app/groups" component={Groups} />
        <Route path="/app/contacts/:id" component={ContactDetail} />
        <Route default component={NotFound} />
      </Router>
    </LocationProvider>
  )
}
