import { useSyncExternalStore } from 'react'
import { connectionStore, type Connection } from '../services/firebase'

export function useConnection(): Connection {
  return useSyncExternalStore(connectionStore.subscribe, connectionStore.getSnapshot)
}
