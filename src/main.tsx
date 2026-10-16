import { render } from "preact"
import "./index.css"
import { App } from "./app.tsx"
import { refresh } from "@/lib/api"

refresh() // restore the session from the refresh cookie, if there is one
render(<App />, document.getElementById("app")!)
