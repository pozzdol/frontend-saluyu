import { AlertCircle, CheckCircle2 } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useState } from "preact/hooks"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"

type FieldProps = {
  name: string
  label: string
  error?: string
  type?: string
  autoComplete?: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  value?: string
  onInput?: (e: InputEvent) => void
  inputMode?: "decimal" | "numeric" | "text"
}

// Field shows the server's per-field message, e.g. {"email": "must be a valid email"}.
export function Field({ name, label, error, ...input }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        className="h-10 rounded-sm"
        {...input}
      />
      {error && (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error[0].toUpperCase() + error.slice(1)}
        </p>
      )}
    </div>
  )
}

export type FormError = { message?: string; fields?: Record<string, string> }

// toFormError splits an API error into a banner message and per-field messages.
export function toFormError(e: unknown): FormError {
  if (e instanceof ApiError) {
    return e.fields ? { fields: e.fields } : { message: e.message[0].toUpperCase() + e.message.slice(1) }
  }
  return { message: "Cannot reach the server. Is the Go API running?" }
}

export function formValues(e: SubmitEvent) {
  e.preventDefault()
  return Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement)) as Record<string, string>
}

// useForm runs one submit at a time and keeps its error or success message.
export function useForm(submit: (v: Record<string, string>, form: HTMLFormElement) => Promise<string>) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<FormError>({})
  const [ok, setOk] = useState("")

  async function onSubmit(e: SubmitEvent) {
    const v = formValues(e)
    setBusy(true)
    setErr({})
    setOk("")
    try {
      setOk(await submit(v, e.currentTarget as HTMLFormElement))
    } catch (e) {
      setErr(toFormError(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, err, ok, onSubmit }
}

export function Status({ err, ok }: { err: FormError; ok: string }) {
  if (err.message)
    return (
      <Alert variant="destructive" className="rounded-sm">
        <AlertCircle />
        <AlertDescription>{err.message}</AlertDescription>
      </Alert>
    )
  if (ok)
    return (
      <Alert className="rounded-sm border-emerald-200 bg-emerald-50 text-emerald-700">
        <CheckCircle2 />
        <AlertDescription className="text-emerald-700">{ok}</AlertDescription>
      </Alert>
    )
  return null
}


// The same look as <Input>, for a native <select>: native gives keyboard and mobile pickers for free.
export const selectClass =
  "h-10 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"

type SelectFieldProps = {
  name: string
  label: string
  error?: string
  value?: string
  onChange?: (value: string) => void
  children: ComponentChildren
  className?: string
}

export function SelectField({ name, label, error, value, onChange, children, className }: SelectFieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange?.((e.target as HTMLSelectElement).value)}
        aria-invalid={!!error}
        className={selectClass}
      >
        {children}
      </select>
      {error && <p className="text-xs text-destructive">{error[0].toUpperCase() + error.slice(1)}</p>}
    </div>
  )
}
