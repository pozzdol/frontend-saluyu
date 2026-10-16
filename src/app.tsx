import type { ComponentType } from "preact"
import { LocationProvider, Route, Router, useLocation } from "preact-iso"
import { useEffect } from "preact/hooks"
import { useAuth, type User } from "@/lib/api"
import { Landing } from "@/pages/landing"
import { AuthPage } from "@/pages/auth"
import { Account } from "@/pages/account"
import { Transactions } from "@/pages/transactions"
import { Accounts } from "@/pages/accounts"
import { LedgerPage } from "@/pages/ledger"
import { TrialBalancePage } from "@/pages/trial-balance"
import { OpeningPage } from "@/pages/opening"
import { ReconcilePage } from "@/pages/reconcile"

// protect renders a page only for a signed-in user and sends everyone else to /login.
function protect<P>(Page: ComponentType<P & { user: User }>) {
  return function Protected(props: P) {
    const { user, ready } = useAuth()
    const { route, path } = useLocation()
    // Books must be opened before anything else in the console makes sense.
    const needsOpening = !!user && !user.start_date && path.startsWith("/app") && path !== "/app/opening"
    useEffect(() => {
      if (ready && !user) route("/login", true)
      else if (needsOpening) route("/app/opening", true)
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
  return (
    <div className="grid min-h-svh place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <a href="/" className="mt-4 inline-block text-sm text-primary hover:underline">Back to home</a>
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

export function App() {
  return (
    <LocationProvider>
      <Router>
        <Route path="/" component={Landing} />
        <Route path="/login" component={() => <AuthPage mode="login" />} />
        <Route path="/register" component={() => <AuthPage mode="register" />} />
        <Route path="/account" component={AccountPage} />
        <Route path="/app" component={() => <Redirect to="/app/transactions" />} />
        <Route path="/app/transactions" component={TransactionsPage} />
        <Route path="/app/accounts" component={AccountsPage} />
        <Route path="/app/accounts/:id" component={Ledger} />
        <Route path="/app/trial-balance" component={TrialBalance} />
        <Route path="/app/opening" component={Opening} />
        <Route path="/app/reconcile" component={Reconcile} />
        <Route default component={NotFound} />
      </Router>
    </LocationProvider>
  )
}
