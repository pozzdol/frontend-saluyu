import { AlertCircle, CheckCircle2 } from "lucide-react"
import type { ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"
import { DatePicker, SelectPicker, type Option } from "@/components/picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, type Account } from "@/lib/api"
import { t, tMaybe } from "@/lib/i18n"
import { cn, toSen } from "@/lib/utils"

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
  onBlur?: (e: FocusEvent) => void
  inputMode?: "decimal" | "numeric" | "text"
  min?: number | string
  max?: number | string
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
        className="h-11 rounded-sm md:h-10"
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
// fieldText turns a validation code like "min_len:3" into words in the current language.
export function fieldText(code: string): string {
  const [tag, n] = code.split(":")
  return tMaybe(`field.${tag}`, { n: n ?? "" }) ?? t("field.invalid")
}

// toFormError splits an API error into a banner message and per-field messages, translated
// from the error codes; the server's English text is the fallback for unknown codes.
export function toFormError(e: unknown): FormError {
  if (e instanceof ApiError) {
    if (e.fieldCodes) return { fields: Object.fromEntries(Object.entries(e.fieldCodes).map(([k, c]) => [k, fieldText(c)])) }
    if (e.fields) return { fields: e.fields }
    const known = e.code ? tMaybe(`errors.${e.code}`) : undefined
    return { message: known ?? e.message[0].toUpperCase() + e.message.slice(1) }
  }
  return { message: t("common.serverDown") }
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


// ---- pickers wired for forms ----
// Each keeps a hidden input with the field's name, so FormData-based submits keep working.

function FieldShell({ name, label, error, className, children }: { name: string; label: string; error?: string; className?: string; children: ComponentChildren }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error && (
        <p id={`${name}-error`} className="text-xs text-destructive">
          {error[0].toUpperCase() + error.slice(1)}
        </p>
      )}
    </div>
  )
}

type SelectFieldProps = {
  name: string
  label: string
  options: Option[]
  error?: string
  value?: string // controlled when set
  defaultValue?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
}

export function SelectField({ name, label, options, error, value, defaultValue, onChange, placeholder, className }: SelectFieldProps) {
  const [own, setOwn] = useState(defaultValue ?? options[0]?.value ?? "")
  // An uncontrolled field whose options changed (e.g. another kind) falls back to the first one.
  useEffect(() => {
    if (value === undefined && !options.some((o) => o.value === own)) setOwn(options[0]?.value ?? "")
  }, [options])
  const current = value ?? own
  return (
    <FieldShell name={name} label={label} error={error} className={className}>
      <SelectPicker
        id={name}
        title={label}
        value={current}
        options={options}
        placeholder={placeholder}
        invalid={!!error}
        onChange={(v) => (setOwn(v), onChange?.(v))}
      />
      <input type="hidden" name={name} value={current} />
    </FieldShell>
  )
}

type DateFieldProps = {
  name: string
  label: string
  error?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  clearable?: boolean
  placeholder?: string
  className?: string
}

export function DateField({ name, label, error, value, defaultValue, onChange, clearable, placeholder, className }: DateFieldProps) {
  const [own, setOwn] = useState(defaultValue ?? "")
  const current = value ?? own
  return (
    <FieldShell name={name} label={label} error={error} className={className}>
      <DatePicker
        id={name}
        title={label}
        value={current}
        clearable={clearable}
        placeholder={placeholder}
        invalid={!!error}
        onChange={(v) => (setOwn(v), onChange?.(v))}
      />
      <input type="hidden" name={name} value={current} />
    </FieldShell>
  )
}

const plain = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 })

// AmountField takes rupiah as people type it and tidies it to "25.000" when they leave the field.
export function AmountField(props: Omit<FieldProps, "type" | "inputMode">) {
  return (
    <Field
      {...props}
      inputMode="decimal"
      onBlur={(e) => {
        const el = e.currentTarget as HTMLInputElement
        const sen = toSen(el.value)
        if (el.value && sen >= 0) el.value = plain.format(sen / 100)
      }}
    />
  )
}

// CheckboxField is a Radix checkbox with its label; it submits "on" when checked, like HTML.
export function CheckboxField({ name, label, hint, checked, onChange }: { name: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={name} className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm md:min-h-0">
      <Checkbox id={name} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5 size-5 rounded-[3px]" />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {checked && <input type="hidden" name={name} value="on" />}
    </label>
  )
}

export type { Option }

// accountOptions turns accounts into picker options grouped by type, e.g. "1001 · Bank" under Asset.
export const accountOptions = (list: Account[]): Option[] =>
  list.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.category, group: a.type }))
