import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"

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
