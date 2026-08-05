import { useState, type FormEvent } from 'react'
import { mapAuthError } from '../utils/authErrors'

export type AuthSubmit = {
  onSubmit: (event: FormEvent) => void
  /** `null` renders nothing — including for the errors that are not errors [R20]. */
  error: string | null
  busy: boolean
}

/**
 * The submit lifecycle the sign-in and sign-up forms share.
 *
 * `busy` is deliberately never cleared on success: the form unmounts as soon as the auth
 * gate flips, and re-enabling the button for the frames in between is long enough to fire
 * a second sign-in. It comes back down only on failure, where the user has to try again.
 */
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
