import { useSyncExternalStore } from 'react'
import { connectionStore, type Connection } from '../services/firebase'

/**
 * The RTDB socket state and the server clock offset, as React state.
 *
 * The store behind this mounts at module load rather than under a uid-keyed effect [R4]:
 * `.info/*` are client-local and exempt from the rules, so unlike every data listener it
 * is safe before auth resolves — and the connection badge has to work on the login screen.
 */
export function useConnection(): Connection {
  return useSyncExternalStore(connectionStore.subscribe, connectionStore.getSnapshot)
}
