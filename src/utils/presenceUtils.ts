import { PRESENCE } from './constants'
import type { SessionNode } from './types'

export type PresenceNode = SessionNode & { sessionId: string }

export function dedupeByUid(nodes: PresenceNode[]): PresenceNode[] {
  const byUid = new Map<string, PresenceNode>()

  for (const node of nodes) {
    const held = byUid.get(node.uid)
    if (!held || isFresher(node, held)) byUid.set(node.uid, node)
  }

  return [...byUid.values()].sort(compareByUid)
}

export function isStale(lastSeen: unknown, now: number, offset: number): boolean {
  if (typeof lastSeen !== 'number' || !Number.isFinite(lastSeen)) return false

  return now + offset - lastSeen > PRESENCE.staleAfterMs
}

function lastSeenOf(node: PresenceNode): number {
  return typeof node.lastSeen === 'number' && Number.isFinite(node.lastSeen) ? node.lastSeen : 0
}

function isFresher(candidate: PresenceNode, held: PresenceNode): boolean {
  const a = lastSeenOf(candidate)
  const b = lastSeenOf(held)
  return a === b ? candidate.sessionId > held.sessionId : a > b
}

function compareByUid(a: PresenceNode, b: PresenceNode): number {
  return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0
}
