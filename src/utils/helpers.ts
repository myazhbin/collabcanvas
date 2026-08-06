import { PALETTE } from './constants'

export function userColour(uid: string, written?: string): string {
  return written || colourFromUid(uid)
}

function colourFromUid(uid: string): string {
  let hash = 0
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) | 0
  }

  return PALETTE[((hash % PALETTE.length) + PALETTE.length) % PALETTE.length]
}
