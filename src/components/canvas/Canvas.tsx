import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import { screenToWorld, type Point } from '../../utils/coords'
import { useCursors } from '../../hooks/useCursors'
import { useCanvas } from '../../hooks/useCanvas'
import { useAuth } from '../../hooks/useAuth'
import { useStableValue } from '../../hooks/useStableValue'
import { useViewport, isInteractiveTarget } from '../../hooks/useViewport'
import { useWindowEvent } from '../../hooks/useWindowEvent'
import { shouldPlace } from '../../utils/placement'
import { collectLiveUids, collectRemoteDrags } from '../../utils/shapeDiff'
import { sessionId } from '../../utils/session'
import { Cursor } from '../collaboration/Cursor'
import { Backdrop } from './Backdrop'
import { Controls } from './Controls'
import { Hint } from './Hint'
import { Hud } from './Hud'
import { ShapesLayer } from './ShapesLayer'
import type { SessionNode } from '../../utils/types'

export function Canvas({ sessions }: { sessions: Record<string, SessionNode> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { size, viewport, spaceHeld, panning, beginPan, onWheel } = useViewport(containerRef)

  const { remote: remoteCursors, latencyMs, publish } = useCursors(sessions)
  const { user } = useAuth()
  const { shapes, tool, selectedId, select, placeAt, deleteShape, beginDrag, moveDrag, endDrag } =
    useCanvas()

  const myUid = user?.uid ?? null

  const remoteDrags = useStableValue(
    useMemo(() => collectRemoteDrags(sessions, sessionId), [sessions]),
    sameDrags,
  )

  const liveUids = useStableValue(useMemo(() => collectLiveUids(sessions), [sessions]), sameUids)

  const pointerScreen = useRef<Point | null>(null)

  const gesture = useRef<{ down: Point; downWorld: Point; targetIsStage: boolean } | null>(null)

  const onMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (beginPan(e)) {
        gesture.current = null
        return
      }

      if (e.evt.button !== 0) return

      const stage = e.target.getStage()
      const world = stage?.getRelativePointerPosition()
      if (!stage || !world) return

      gesture.current = {
        down: { x: e.evt.clientX, y: e.evt.clientY },
        downWorld: world,
        targetIsStage: e.target === stage,
      }
    },
    [beginPan],
  )

  useWindowEvent('mouseup', (e) => {
    const g = gesture.current
    gesture.current = null
    if (!g || e.button !== 0) return

    const wasBackgroundClick = shouldPlace({
      down: g.down,
      up: { x: e.clientX, y: e.clientY },
      targetIsStage: g.targetIsStage,
    })
    if (!wasBackgroundClick) return

    if (tool === 'rectangle') placeAt(g.downWorld)
    else select(null)
  })

  useWindowEvent('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    if (!selectedId || isInteractiveTarget(e.target)) return

    e.preventDefault()
    deleteShape(selectedId)
  })

  const onMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage()
      const screen = stage?.getPointerPosition()
      const world = stage?.getRelativePointerPosition()
      if (!screen || !world) return

      pointerScreen.current = screen
      publish(world)
    },
    [publish],
  )

  const onMouseLeave = useCallback(() => {
    pointerScreen.current = null
    publish(null)
  }, [publish])

  useEffect(() => {
    const screen = pointerScreen.current
    if (screen) publish(screenToWorld(screen, viewport))
  }, [viewport, publish])

  const cursor = panning
    ? 'grabbing'
    : spaceHeld
      ? 'grab'
      : tool === 'rectangle'
        ? 'crosshair'
        : 'default'

  return (
    <div
      ref={containerRef}
      onMouseLeave={onMouseLeave}
      className="relative min-h-0 flex-1 overflow-hidden bg-neutral-200"
      style={{ cursor }}
    >
      <Stage
        width={size.width}
        height={size.height}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        x={viewport.x}
        y={viewport.y}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
        <Layer listening={false}>
          <Backdrop viewport={viewport} size={size} />
        </Layer>

        <ShapesLayer
          shapes={shapes}
          selectedId={selectedId}
          myUid={myUid}
          liveUids={liveUids}
          remoteDrags={remoteDrags}
          dragEnabled={tool === 'select'}
          listening={!spaceHeld}
          onSelect={select}
          onDragStart={beginDrag}
          onDragMove={moveDrag}
          onDragEnd={endDrag}
        />
      </Stage>

      <div
        className="cc-cursor-layer"
        style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0)` }}
      >
        {remoteCursors.map((remote) => (
          <Cursor key={remote.sessionId} cursor={remote} scale={viewport.scale} />
        ))}
      </div>

      <Controls />

      <Hint />

      <Hud viewport={viewport} spaceHeld={spaceHeld} latencyMs={latencyMs} />
    </div>
  )
}

function sameDrags(
  a: ReadonlyMap<string, { x: number; y: number }>,
  b: ReadonlyMap<string, { x: number; y: number }>,
): boolean {
  if (a.size !== b.size) return false

  for (const [id, position] of a) {
    const other = b.get(id)
    if (!other || other.x !== position.x || other.y !== position.y) return false
  }

  return true
}

function sameUids(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false

  for (const uid of a) if (!b.has(uid)) return false

  return true
}
