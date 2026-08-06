import { useState, type FormEvent } from 'react'
import { mapAuthError } from '../utils/authErrors'

export type AuthSubmit = {
  onSubmit: (event: FormEvent) => void
  error: string | null
  busy: boolean
}

export function useAuthSubmit(submit: () => Promise<unknown>): AuthSubmit {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    void submit().catch((err: unknown) => {
      setError(mapAuthError(err))
      setBusy(false)
    })
  }

  return { onSubmit, error, busy }
}
