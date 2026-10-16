import { render } from "preact"
import "./index.css"
import { App } from "./app.tsx"
import { refresh } from "@/lib/api"
import "@/lib/install" // listens for the install prompt from the first moment

refresh() // restore the session from the refresh cookie, if there is one
render(<App />, document.getElementById("app")!)

// Installable app and offline shell. Production only: in development the service worker
// would cache Vite's modules and fight hot reload.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}))
}
