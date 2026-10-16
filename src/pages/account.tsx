import { KeyRound, Loader2, LogOut, UserRound } from "lucide-react"
import { useState } from "preact/hooks"
import { Field, Status, useForm } from "@/components/field"
import { Label } from "@/components/ui/label"
import { AppShell } from "@/components/app-shell"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { changePassword, logout, updateProfile, type User } from "@/lib/api"
import { DayOfMonthPicker } from "@/components/picker"

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

// PaydayField picks the day each budget period starts; the hidden input feeds the profile form.
function PaydayField({ day, error }: { day: number; error?: string }) {
  const [value, setValue] = useState(day)
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="period_start_day">Payday (period start day)</Label>
      <DayOfMonthPicker id="period_start_day" value={value} onChange={setValue} />
      <input type="hidden" name="period_start_day" value={String(value)} />
      {error && <p className="text-xs text-destructive">{error[0].toUpperCase() + error.slice(1)}</p>}
    </div>
  )
}

export function Account({ user }: { user: User }) {
  const profile = useForm(async (v) => {
    // Send only changed fields: the API treats a missing field as "leave as is".
    const body: { name?: string; img_url?: string; period_start_day?: number } = {}
    if (v.name !== user.name) body.name = v.name
    if (v.img_url !== user.img_url) body.img_url = v.img_url
    if (Number(v.period_start_day) !== user.period_start_day) body.period_start_day = Number(v.period_start_day)
    if (Object.keys(body).length === 0) return "Nothing to update."
    await updateProfile(body)
    return "Profile saved."
  })

  const password = useForm(async (v, form) => {
    await changePassword({ old_password: v.old_password, new_password: v.new_password })
    form.reset()
    return "Password changed. Every other device has been signed out."
  })

  const [leaving, setLeaving] = useState(false)

  return (
    <AppShell title="Profile">
      <section className="mb-6 rounded-sm border bg-card">
        <div className="flex flex-wrap items-center gap-4 p-4 md:gap-5 md:p-6">
          <Avatar className="size-16 rounded-sm ring-4 ring-white">
            <AvatarImage src={user.img_url || undefined} alt="" className="rounded-sm object-cover" />
            <AvatarFallback className="rounded-sm bg-primary text-lg font-semibold text-primary-foreground">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">{user.name}</h2>
              <Badge className="rounded-sm bg-emerald-100 text-emerald-700">{user.is_active ? "Active" : "Inactive"}</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button
            variant="outline"
            className="w-full rounded-sm bg-white md:ml-auto md:w-auto"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true)
              await logout().catch(() => {}) // local session is cleared either way
            }}
          >
            {leaving ? <Loader2 className="animate-spin" /> : <LogOut />}
            Sign out
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" /> Profile
            </CardTitle>
            <CardDescription>Your name and avatar as shown in the console.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={profile.onSubmit} className="grid gap-4" noValidate>
              <Status {...profile} />
              <Field name="name" label="Full name" defaultValue={user.name} error={profile.err.fields?.name} />
              <Field
                name="img_url"
                label="Avatar URL"
                type="url"
                placeholder="https://…"
                defaultValue={user.img_url}
                error={profile.err.fields?.img_url}
              />
              <PaydayField day={user.period_start_day} error={profile.err.fields?.period_start_day} />
              <p className="-mt-2 text-xs text-muted-foreground">
                Day 1 to 28 when your month starts. Changing this re-slices past periods too.
              </p>
              <Field name="email" label="Email (cannot be changed)" defaultValue={user.email} type="email" disabled />
              <Button type="submit" disabled={profile.busy} className="h-10 rounded-sm">
                {profile.busy && <Loader2 className="animate-spin" />}
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> Security
            </CardTitle>
            <CardDescription>Changing your password signs out every other device.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={password.onSubmit} className="grid gap-4" noValidate>
              <Status {...password} />
              <Field
                name="old_password"
                label="Current password"
                type="password"
                autoComplete="current-password"
                error={password.err.fields?.old_password}
              />
              <Field
                name="new_password"
                label="New password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                error={password.err.fields?.new_password}
              />
              <Button type="submit" disabled={password.busy} className="h-10 rounded-sm">
                {password.busy && <Loader2 className="animate-spin" />}
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
