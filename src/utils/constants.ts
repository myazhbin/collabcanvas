export const CANVAS_ID = 'global-canvas-v1'

export const WORLD = { width: 10_000, height: 10_000 }
export const SHAPE = { width: 120, height: 80 }

export const PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#ca8a04',
]

/** Cursor/drag write interval. 20 Hz — the network throttle, never rAF [R16]. */
export const THROTTLE_MS = 50
