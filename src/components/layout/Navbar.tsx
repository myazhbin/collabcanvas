import { useState, useSyncExternalStore } from 'react'
import { connectionStore } from '../../services/firebase'
import { useAuth } from '../../hooks/useAuth'
import { Presence } from '../collaboration/Presence'
import { generateUserColor } from '../../utils/helpers'
import type { PresenceNode } from '../../utils/presenceUtils'
import { sessionId } from '../../utils/session'

/**
 * Online stack, connection badge, user chip, sign out. `online` is passed in rather than
 * pulled from `usePresence` here: that hook *publishes* this tab's session node as well
 * as reading everyone's, so calling it twice would start two publishers.
 */
export function Navbar({ online }: { online: PresenceNode[] }) {
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

      <div className="ml-auto flex items-center gap-4">
        <Presence online={online} />

        {/* The session id rides along in the tooltip. Two tabs of one account must show
            two *different* ids while collapsing to a single avatar in the stack above —
            that pairing is R2, and this is where you check it by hand. */}
        <span
          className="flex items-center gap-2"
          title={`${user?.email ?? ''}\nsession ${sessionId.slice(0, 8)}`}
        >
          <span
            style={{ backgroundColor: user ? generateUserColor(user.uid) : undefined }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-white"
          >
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
