import { PALETTE } from './constants'

/**
 * A stable colour per user, derived rather than stored.
 *
 * Determinism is the whole contract: the colour is written onto the session node, but it
 * is also computed locally for your own avatar before that node round-trips, and the two
 * have to agree or your dot changes colour a beat after you join.
 */
export function generateUserColor(uid: string): string {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    // `| 0` keeps this in int32 so the result can't drift into float territory for long
    // uids, where equal inputs could otherwise round to different hashes.
    hash = (hash * 31 + uid.charCodeAt(i)) | 0
  }

  // Double modulo rather than Math.abs: `Math.abs(-2147483648)` escapes int32, and a
  // negative index would hand back `undefined` — an invalid fill Konva renders as black.
  return PALETTE[((hash % PALETTE.length) + PALETTE.length) % PALETTE.length]
}

/**
 * The colour to paint a peer in: the one written on their session node, falling back to
 * the local derivation. The two agree by construction — this covers the node caught
 * mid-write, where an empty fill would otherwise render black.
 */
export function userColour(uid: string, written?: string): string {
  return written || generateUserColor(uid)
}
