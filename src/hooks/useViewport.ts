import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type Konva from 'konva'
import { WORLD, ZOOM } from '../utils/constants'
import {
  centreOn,
  clampViewport,
  panBy,
  zoomAtPoint,
  type Point,
  type Size,
  type Viewport,
} from '../utils/coords'
import { useWindowEvent } from './useWindowEvent'

export function useViewport(containerRef: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 })
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)

  const panOrigin = useRef<{ pointer: Point; viewport: Viewport } | null>(null)
  const centred = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  useEffect(() => {
    if (!size.width || !size.height) return

    if (!centred.current) {
      centred.current = true
      setViewport(clampViewport(centreOn({ x: WORLD.width / 2, y: WORLD.height / 2 }, size, 1), size))
      return
    }

    setViewport((vp) => clampViewport(vp, size))
  }, [size])

  useWindowEvent('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat || isInteractiveTarget(e.target)) return
    e.preventDefault()
    setSpaceHeld(true)
  })
  useWindowEvent('keyup', (e) => {
    if (e.code === 'Space') setSpaceHeld(false)
  })
  useWindowEvent('blur', () => setSpaceHeld(false))

  useWindowEvent(
    'mousemove',
    (e) => {
      const origin = panOrigin.current
      if (!origin) return

      const next = panBy(origin.viewport, e.clientX - origin.pointer.x, e.clientY - origin.pointer.y)
      setViewport(clampViewport(next, size))
    },
    panning,
  )
  useWindowEvent(
    'mouseup',
    () => {
      panOrigin.current = null
      setPanning(false)
    },
    panning,
  )

  const beginPan = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const middleButton = e.evt.button === 1
      const spaceDrag = spaceHeld && e.evt.button === 0

      if (!middleButton && !spaceDrag) return false

      e.evt.preventDefault()
      panOrigin.current = { pointer: { x: e.evt.clientX, y: e.evt.clientY }, viewport }
      setPanning(true)
      return true
    },
    [spaceHeld, viewport],
  )

  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()

      if (wheelIntent(e.evt) === 'pan') {
        setViewport((vp) => clampViewport(panBy(vp, -e.evt.deltaX, -e.evt.deltaY), size))
        return
      }

      const pointer = e.target.getStage()?.getPointerPosition()
      if (!pointer) return

      const factor = e.evt.ctrlKey
        ? Math.exp(-e.evt.deltaY * ZOOM.pinchSensitivity)
        : e.evt.deltaY > 0
          ? 1 / ZOOM.step
          : ZOOM.step

      setViewport((vp) => clampViewport(zoomAtPoint(vp, pointer, factor), size))
    },
    [size],
  )

  return { size, viewport, spaceHeld, panning, beginPan, onWheel }
}

export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName)
  )
}

function wheelIntent(e: WheelEvent): 'zoom' | 'pan' {
  if (e.ctrlKey || e.metaKey) return 'zoom'
  if (e.deltaMode !== 0) return 'zoom'
  if (e.deltaX !== 0) return 'pan'
  return Math.abs(e.deltaY) >= 100 && Number.isInteger(e.deltaY) ? 'zoom' : 'pan'
}
