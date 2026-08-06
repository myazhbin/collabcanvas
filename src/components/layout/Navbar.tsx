import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useConnection } from '../../hooks/useConnection'
import { Avatar } from '../collaboration/Avatar'
import { Presence } from '../collaboration/Presence'
import { userColour } from '../../utils/helpers'
import type { PresenceNode } from '../../utils/presenceUtils'
import { sessionId } from '../../utils/session'

export function Navbar({ online }: { online: PresenceNode[] }) {
  const { displayName, user, logOut } = useAuth()
  const { connected, offset } = useConnection()
  const [busy, setBusy] = useState(false)

  const onSignOut = async () => {
    setBusy(true)
    try {
      await logOut()
    } finally {
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

        <span
          className="flex items-center gap-2"
          title={`${user?.email ?? ''}\nsession ${sessionId.slice(0, 8)}`}
        >
          <Avatar name={displayName} colour={user ? userColour(user.uid) : undefined} />
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
