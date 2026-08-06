import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAuthSubmit } from '../../hooks/useAuthSubmit'
import { Field, FormError, SubmitButton } from './FormControls'

export function Signup() {
  const { signUp } = useAuth()

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
