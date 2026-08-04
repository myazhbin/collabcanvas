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

/**
 * 10%–400% per PRD F1. `step` is one mouse-wheel notch — a discrete detent, so a fixed
 * multiplier is right. A trackpad pinch arrives as a stream of small deltas instead, so
 * it scales exponentially with `pinchSensitivity` and stays proportional to the gesture.
 */
export const ZOOM = { min: 0.1, max: 4, step: 1.05, pinchSensitivity: 0.01 }

/** World-space grid pitches, coarsest picked so lines stay ≥ `GRID_MIN_SCREEN_PX` apart
 *  on screen. A fixed pitch either vanishes when zoomed out or turns solid. */
export const GRID_PITCHES = [10, 20, 40, 80, 160, 320, 640, 1280, 2560]
export const GRID_MIN_SCREEN_PX = 24

/**
 * Presence timings. The heartbeat is the only thing that keeps a node looking alive, so
 * `staleAfterMs` has to tolerate missed beats — Firebase publishes no ungraceful-disconnect
 * timeout, and this filter is the backstop for a client that died without `onDisconnect`
 * firing. `sweepMs` re-evaluates staleness on a timer, because a peer that stops sending
 * never triggers a listener callback to recompute it.
 *
 * **`staleAfterMs` was 30 s and that was too tight.** Browsers throttle timers in hidden
 * tabs: Chromium clamps `setInterval` to 1 Hz as soon as a tab is backgrounded and to
 * **once per minute** after ~5 minutes of it. A 10 s heartbeat therefore cannot keep a
 * backgrounded tab under a 30 s threshold, so a user who simply switched tabs vanished
 * from everyone else's panel within half a minute and reappeared when they came back —
 * measured, not theorised, with two tabs open on this canvas.
 *
 * They had not left. The RTDB socket stays open in a hidden tab, which is precisely why
 * `onDisconnect` — a *server-side* handler fired by socket loss — is the real leave
 * signal and this filter is only the backstop for the rare case that misses. 90 s clears
 * the worst-case throttled gap with headroom, and erring long is the direction R17 already
 * argues for: a ghost is a blemish, an empty list is a failed gate item.
 */
export const PRESENCE = { heartbeatMs: 10_000, staleAfterMs: 90_000, sweepMs: 5_000 }

/** Cursor/drag write interval. 20 Hz — the network throttle, never rAF [R16]. */
export const THROTTLE_MS = 50

/**
 * How far the pointer may travel between press and release and still count as a click
 * rather than a pan [R13]. **Screen pixels**, because it models a hand that is not
 * perfectly still, not anything about the canvas — at 400% zoom a 4 px twitch has to stay
 * a click. See `placement.ts` for why the target test matters just as much.
 */
export const PLACEMENT = { tolerancePx: 5 }
