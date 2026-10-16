// Add to home screen. Chrome and Edge fire beforeinstallprompt when the app is installable; we keep
// the event so our own button can open the install dialog. Safari on iOS has no such event and
// installs only from its Share menu, so there the button explains the two taps instead.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: InstallEvent | null = null
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault() // our button asks instead of the browser's own bar
  deferred = e as InstallEvent
})

export const isInstalled = () => matchMedia("(display-mode: standalone)").matches

// install opens the browser's dialog when it can, else says which manual steps apply.
export async function install(): Promise<"accepted" | "dismissed" | "ios" | "manual"> {
  if (deferred) {
    const e = deferred
    deferred = null // the event works once
    await e.prompt()
    return (await e.userChoice).outcome
  }
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "manual"
}
