import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  type: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
  minLength?: number
  hint?: string
}

export function Field({ label, type, value, onChange, autoComplete, placeholder, minLength, hint }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      {hint && <span className="text-xs text-neutral-500">{hint}</span>}
    </label>
  )
}

export function FormError({ message, className = '' }: { message: string | null; className?: string }) {
  if (!message) return null

  return (
    <p role="alert" className={`rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}>
      {message}
    </p>
  )
}

export function SubmitButton({
  busy,
  busyLabel,
  children,
}: {
  busy: boolean
  busyLabel: string
  children: ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {busy ? busyLabel : children}
    </button>
  )
}
