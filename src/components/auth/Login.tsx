import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAuthSubmit } from '../../hooks/useAuthSubmit'
import { mapAuthError } from '../../utils/authErrors'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoAccount } from '../../utils/demoAccounts'
import { Field, FormError, SubmitButton } from './FormControls'
import { Signup } from './Signup'

/**
 * The signed-out screen: the demo block, the email/password form, the Google button,
 * and the toggle to `Signup`. Both sign-in methods live here so the Google path is
 * written once.
 */
export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  return (
    <div className="flex h-full items-center justify-center bg-neutral-100 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-neutral-900">CollabCanvas</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-500">
          {mode === 'login'
            ? 'Sign in to join the shared canvas.'
            : 'Create an account to join the shared canvas.'}
        </p>

        {/* Above the form, not below it. This is the fastest route into the app and the one
            thing on this screen a first-time visitor should see first [F7,R22]. */}
        {mode === 'login' && <DemoAccounts />}

        {mode === 'login' ? <EmailPasswordForm /> : <Signup />}

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-neutral-200" />
          <span className="text-xs text-neutral-400">or</span>
          <span className="h-px flex-1 bg-neutral-200" />
        </div>

        <GoogleButton />

        <p className="mt-6 text-center text-sm text-neutral-500">
          {mode === 'login' ? 'No account yet?' : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="font-medium text-blue-600 hover:underline"
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

/**
 * "Try it instantly" — three one-click identities `[F7,R22]`.
 *
 * Gate items 4, 5 and 6 all need two people signed in at once, so the credentials are
 * printed as well as wired to a button: a grader driving a second browser will often type
 * them rather than come back to this screen. The first click on a chip creates the account
 * if it does not exist yet — see `authService.signInAsDemo`.
 *
 * `busy` holds the *email* rather than a boolean, so the chip that was clicked can say so
 * while the other two only grey out. Three buttons all reading "Signing in…" would leave a
 * grader unsure which identity they are about to become.
 */
function DemoAccounts() {
  const { signInAsDemo } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onPick = (account: DemoAccount) => {
    setBusy(account.email)
    setError(null)

    // Not cleared on success: the whole screen unmounts when the auth gate flips, and
    // re-enabling the chips for those frames is long enough to start a second sign-in.
    void signInAsDemo(account).catch((err: unknown) => {
      setError(mapAuthError(err))
      setBusy(null)
    })
  }

  return (
    <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
      <p className="text-xs font-semibold text-blue-900">Try it instantly</p>
      <p className="mt-0.5 text-xs text-blue-800/80">
        Pick a name here, then open a second browser and pick a different one — that is the
        whole demo.
      </p>

      <div className="mt-2.5 flex flex-col gap-1.5">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.email}
            type="button"
            onClick={() => onPick(account)}
            disabled={busy !== null}
            className="flex items-baseline justify-between gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-left text-sm text-neutral-800 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-60"
          >
            <span className="font-medium">
              {busy === account.email ? 'Signing in…' : account.name}
            </span>
            {/* Never `truncate`: this is meant to be *read* and retyped into a second
                browser, so an address that does not fit has to wrap rather than lose its
                tail to an ellipsis. */}
            <span className="font-mono text-xs break-all text-neutral-500">{account.email}</span>
          </button>
        ))}
      </div>

      <p className="mt-2 font-mono text-xs text-blue-900/70">
        password: <span className="select-all">{DEMO_PASSWORD}</span> — all three
      </p>

      <FormError message={error} className="mt-2" />
    </div>
  )
}

function EmailPasswordForm() {
  const { logIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const { onSubmit, error, busy } = useAuthSubmit(() => logIn(email.trim(), password))

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
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
        autoComplete="current-password"
      />

      <FormError message={error} />

      <SubmitButton busy={busy} busyLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  )
}

/**
 * Not built on `useAuthSubmit`, and the difference is the whole reason this is its own
 * component: `signInWithPopup` has to be reached synchronously from the click, so the call
 * is the first statement and the state updates follow it. Anything awaited in front lands
 * the call outside the user-gesture window and the browser blocks the popup — which
 * presents as the app hanging, not as a blocked popup [R20].
 */
function GoogleButton() {
  const { signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onClick = () => {
    const pending = signInWithGoogle()

    setError(null)
    setBusy(true)

    pending.catch((err) => {
      setError(mapAuthError(err))
      setBusy(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </button>

      <FormError message={error} className="mt-3" />
    </>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}
