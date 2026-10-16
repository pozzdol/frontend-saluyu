import { LocationProvider, Route, Router, useLocation } from "preact-iso"
import { useEffect } from "preact/hooks"
import { useAuth } from "@/lib/api"
import { Landing } from "@/pages/landing"
import { AuthPage } from "@/pages/auth"
import { Account } from "@/pages/account"

function Protected() {
  const { user, ready } = useAuth()
  const { route } = useLocation()
  useEffect(() => {
    if (ready && !user) route("/login", true)
  }, [ready, user])
  return user ? <Account user={user} /> : null
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

export function App() {
  return (
    <LocationProvider>
      <Router>
        <Route path="/" component={Landing} />
        <Route path="/login" component={() => <AuthPage mode="login" />} />
        <Route path="/register" component={() => <AuthPage mode="register" />} />
        <Route path="/account" component={Protected} />
        <Route default component={NotFound} />
      </Router>
    </LocationProvider>
  )
}
