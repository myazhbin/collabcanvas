import type { Viewport } from '../../utils/coords'

export function Hud({
  viewport,
  spaceHeld,
  latencyMs,
}: {
  viewport: Viewport
  spaceHeld: boolean
  latencyMs: number | null
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-lg bg-white/85 px-2.5 py-1.5 font-mono text-xs text-neutral-500 shadow-sm backdrop-blur-sm">
      <span className="tabular-nums">{Math.round(viewport.scale * 100)}%</span>
      <span className={spaceHeld ? 'text-neutral-900' : ''}>space-drag</span>
      <span>middle-drag</span>
      <span>scroll</span>
      <span>·</span>
      <span>wheel or pinch to zoom</span>

      {latencyMs !== null && (
        <>
          <span>·</span>
          <span
            title="median end-to-end cursor latency, measured from the payload timestamp"
            className="tabular-nums"
          >
            {latencyMs} ms
          </span>
        </>
      )}
    </div>
  )
}
