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

export const ZOOM = { min: 0.1, max: 4, step: 1.05, pinchSensitivity: 0.01 }

export const GRID_PITCHES = [10, 20, 40, 80, 160, 320, 640, 1280, 2560]
export const GRID_MIN_SCREEN_PX = 24

export const PRESENCE = { heartbeatMs: 10_000, staleAfterMs: 90_000, sweepMs: 5_000 }

export const THROTTLE_MS = 50

export const PLACEMENT = { tolerancePx: 5 }
