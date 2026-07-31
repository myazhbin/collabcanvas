import { useEffect, useRef, useState } from 'react'
import { Layer, Rect, Stage } from 'react-konva'

/**
 * PR 1 smoke test [R18]: one hardcoded blue Rect in a Stage, to prove
 * react-konva renders against React 19 before any Firebase code exists.
 * PR 4 replaces this with the real pannable/zoomable Canvas.
 *
 * The Stage is sized from a ResizeObserver rather than a one-shot read of
 * `window.innerWidth`: first paint can happen before layout, and a snapshot
 * taken then pins the canvas at 0×0 for the life of the page.
 */
function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="relative h-full w-full bg-neutral-100">
      <Stage width={size.width} height={size.height}>
        <Layer>
          <Rect
            x={size.width / 2 - 120}
            y={size.height / 2 - 80}
            width={240}
            height={160}
            fill="#2563eb"
          />
        </Layer>
      </Stage>

      <p className="absolute top-4 left-4 font-mono text-sm text-neutral-500">
        CollabCanvas — konva smoke test
      </p>
    </div>
  )
}

export default App
