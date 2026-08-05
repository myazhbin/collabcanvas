import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAuthSubmit } from '../../hooks/useAuthSubmit'
import { Field, FormError, SubmitButton } from './FormControls'

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

  const { onSubmit, error, busy } = useAuthSubmit(() => signUp(email.trim(), password, name.trim()))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field
        label="Display name"
        type="text"
        value={name}
        onChange={setName}
        autoComplete="name"
        placeholder="Ada Lovelace"
      />
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={6}
        hint="At least 6 characters."
      />

      <FormError message={error} />

      <SubmitButton busy={busy} busyLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  )
}
