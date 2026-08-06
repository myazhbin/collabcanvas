import { useEffect, useRef } from 'react'
import type { Channel } from '../services/cursorService'

export function useChannel<T>(start: () => Channel<T>, uid: string | undefined) {
  const channel = useRef<Channel<T> | null>(null)

  useEffect(() => {
    if (!uid) return

    const started = start()
    channel.current = started
    return () => {
      channel.current = null
      started.stop()
    }
  }, [start, uid])

  return channel
}
