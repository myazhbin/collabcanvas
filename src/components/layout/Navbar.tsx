import { useState, useSyncExternalStore } from 'react'
import { connectionStore } from '../../services/firebase'
import { useAuth } from '../../hooks/useAuth'
import { sessionId } from '../../utils/session'

/**
 * User chip, connection badge, sign out. The badge takes over the temporary corner
 * readout from PR 2; PR 5 gives the chip its `generateUserColor` swatch and completes
 * the sign-out teardown behind the button [R19].
 */
export function Navbar() {
  const { displayName, user, logOut } = useAuth()
  const { connected, offset } = useSyncExternalStore(
    connectionStore.subscribe,
    connectionStore.getSnapshot,
  )
  const [busy, setBusy] = useState(false)

  const onSignOut = async () => {
    setBusy(true)
    try {
      await logOut()
    } finally {
      // Unlike the auth forms this component survives the transition for a beat, so
      // the flag has to come back down or a failed sign-out leaves a dead button.
      setBusy(false)
    }
  }

  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-4 py-2.5">
      <span className="text-sm font-semibold text-neutral-900">CollabCanvas</span>

      <span
        title={`server time offset: ${offset}ms`}
        className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
          connected ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500'}`}
        />
        {connected ? 'Live' : 'Reconnecting…'}
      </span>

      <div className="ml-auto flex items-center gap-3">
        {/* The session id rides along in the tooltip: two tabs of one account must show
            two different ids, which is R2's keying made checkable before PR 5 renders it
            as two presence entries. */}
        <span
          className="flex items-center gap-2"
          title={`${user?.email ?? ''}\nsession ${sessionId.slice(0, 8)}`}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-700">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-sm text-neutral-700">{displayName}</span>
        </span>

        <button
          type="button"
          onClick={onSignOut}
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </header>
  )
}
