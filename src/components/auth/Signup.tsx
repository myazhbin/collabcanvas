import { useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { mapAuthError } from '../../utils/authErrors'

/** Rendered inside `Login`'s card, which owns the Google button and the mode toggle. */
export function Signup() {
  const { signUp } = useAuth()

  // `name` is the R11 mitigation in its entirety: a controlled input holds the display
  // name in React state before `createUserWithEmailAndPassword` is ever called, and
  // AuthContext keeps it after. Nothing downstream reads `auth.currentUser.displayName`,
  // which stays null until the next sign-in.
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)

    try {
      await signUp(email.trim(), password, name.trim())
      // Success unmounts this form — leave `busy` set so the button cannot be fired
      // twice in the gap before the gate flips.
    } catch (err) {
      setError(mapAuthError(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-600">Display name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          placeholder="Ada Lovelace"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-600">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-600">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {/* Inline, not after a round trip: Firebase's weak-password rejection costs a
            network call to learn something the field can say up front. */}
        <span className="text-xs text-neutral-500">At least 6 characters.</span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
