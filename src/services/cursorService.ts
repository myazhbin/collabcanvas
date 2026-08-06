import { ref, update } from 'firebase/database'
import { connectionStore, rtdb } from './firebase'
import { isSessionAnnounced, SESSIONS_PATH } from './presenceService'
import { THROTTLE_MS } from '../utils/constants'
import { sessionId } from '../utils/session'
import { throttle } from '../utils/throttle'
import type { Point } from '../utils/coords'
import type { CursorPayload, DragPayload } from '../utils/types'

export type Channel<T> = {
  publish: (value: T | null) => void
  stop: () => void
}

type ChannelSpec<T> = {
  field: 'cursor' | 'drag'
  isSame: (last: T, next: T) => boolean
  pauseWhileHidden: boolean
  clearOnStop: boolean
}

function startChannel<T>(spec: ChannelSpec<T>): Channel<T> {
  const node = ref(rtdb, `${SESSIONS_PATH}/${sessionId}`)
  let stopped = false
  let hidden = document.visibilityState === 'hidden'

  let last: T | null = null

  const write = (value: T | null) => {
    if (stopped || !connectionStore.getSnapshot().connected || !isSessionAnnounced()) return

    void update(node, { [spec.field]: value }).catch((err) => {
      console.warn(`${spec.field} write to /${SESSIONS_PATH}/${sessionId} failed`, err)
    })
  }

  const send = throttle(write, THROTTLE_MS)

  const clear = () => {
    send.cancel()
    if (last === null) return
    last = null
    write(null)
  }

  const publish = (value: T | null) => {
    if (stopped || (hidden && spec.pauseWhileHidden)) return
    if (value === null) {
      clear()
      return
    }

    if (last !== null && spec.isSame(last, value)) return
    last = value
    send(value)
  }

  const onVisibility = () => {
    hidden = document.visibilityState === 'hidden'
    if (hidden) clear()
  }

  document.addEventListener('visibilitychange', onVisibility)

  const stop = () => {
    if (spec.clearOnStop) clear()
    stopped = true
    send.cancel()
    document.removeEventListener('visibilitychange', onVisibility)
  }

  return { publish, stop }
}

export type CursorChannel = Channel<Point>

export function startCursorChannel(): CursorChannel {
  const channel = startChannel<CursorPayload>({
    field: 'cursor',
    isSame: (last, next) => last.x === next.x && last.y === next.y,
    pauseWhileHidden: true,
    clearOnStop: false,
  })

  return {
    publish: (world) =>
      channel.publish(
        world && {
          x: world.x,
          y: world.y,
          t: Date.now() + connectionStore.getSnapshot().offset,
        },
      ),
    stop: channel.stop,
  }
}

export type DragChannel = Channel<DragPayload>

export function startDragChannel(): DragChannel {
  return startChannel<DragPayload>({
    field: 'drag',
    isSame: (last, next) => last.id === next.id && last.x === next.x && last.y === next.y,
    pauseWhileHidden: false,
    clearOnStop: true,
  })
}
