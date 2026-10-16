import type { ComponentType } from "preact"
import { LocationProvider, Route, Router, useLocation } from "preact-iso"
import { useEffect } from "preact/hooks"
import { useAuth, type User } from "@/lib/api"
import { Landing } from "@/pages/landing"
import { AuthPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from "@/pages/auth"
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
import { PrivacyPage } from "@/pages/privacy"
import { browserLocale, setLocale, useT } from "@/lib/i18n"

// protect renders a page only for a signed-in user and sends everyone else to /login.
function protect<P>(Page: ComponentType<P & { user: User }>) {
  return function Protected(props: P) {
    const { user, ready } = useAuth()
    const { route, path } = useLocation()
    // Books must be opened before anything else in the console makes sense.
    const needsOpening = !!user && !user.start_date && path.startsWith("/app") && path !== "/app/opening" && path !== "/app/welcome"
    useEffect(() => {
      if (ready && !user) route("/login", true)
      else if (needsOpening) route("/app/welcome", true)
    }, [ready, user, needsOpening])
    return user && !needsOpening ? <Page {...props} user={user} /> : null
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
    <div className="grid min-h-svh place-items-center px-4 text-center">
      <div>
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
const Privacy = protect(PrivacyPage)
const ContactDetail = protect(({ params }: { params: { id: string } }) => <ContactPage id={params.id} />)

// LocaleSync follows the user's saved language, or the browser's when none is saved.
function LocaleSync() {
  const { user } = useAuth()
  useEffect(() => setLocale(user?.locale ?? browserLocale()), [user?.locale])
  return null
}

export function App() {
  return (
    <LocationProvider>
      <LocaleSync />
      <Router>
        <Route path="/" component={Landing} />
        <Route path="/login" component={() => <AuthPage mode="login" />} />
        <Route path="/register" component={() => <AuthPage mode="register" />} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
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
