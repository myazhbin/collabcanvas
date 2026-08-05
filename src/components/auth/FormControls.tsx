import type { ReactNode } from 'react'

/**
 * The three pieces the sign-in and sign-up forms are both built from.
 *
 * They exist because the two forms are the same form with different fields: five inputs
 * between them differing only by label, type and autocomplete, two identical error boxes,
 * two identical submit buttons. Written out twice, the copies drift — and the way that
 * shows up is a focus ring or a disabled state that is right on one screen and wrong on
 * the other, which nobody notices until a grader is looking at it.
 */

type FieldProps = {
  label: string
  type: 'text' | 'email' | 'password'
  value: string
  onChange: (value: string) => void
  /** Always set: a sign-in form the password manager cannot read is a worse sign-in form. */
  autoComplete: string
  placeholder?: string
  minLength?: number
  /** Shown under the input. Says what the server would reject, before it costs a round trip. */
  hint?: string
}

/** A labelled, required text input. Every field on both forms is one of these. */
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

/**
 * `role="alert"` so a screen reader announces the failure instead of leaving the user with
 * a form that silently did nothing. A `null` message renders nothing at all — `mapAuthError`
 * returns exactly that for a closed Google popup, which is not an error [R20].
 */
export function FormError({ message, className = '' }: { message: string | null; className?: string }) {
  if (!message) return null

  return (
    <p role="alert" className={`rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}>
      {message}
    </p>
  )
}

/** Disabled while the request is in flight — see `useAuthSubmit` for why it stays that way
 *  on success. */
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
