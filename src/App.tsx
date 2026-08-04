import { useEffect, useRef, useState } from 'react'
import { Layer, Rect, Stage } from 'react-konva'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/useAuth'
import { Login } from './components/auth/Login'
import { Navbar } from './components/layout/Navbar'
import { sessionId } from './utils/session'

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}

/**
 * The three-state gate [R4]. The `loading` branch is why this is three states and not
 * a boolean: `onAuthStateChanged` doesn't fire synchronously, so rendering `Login` for
 * a null user flashes the sign-in form at a signed-in user on every single reload.
 */
function AuthGate() {
  const { status } = useAuth()

  if (status === 'loading') return <Splash />
  if (status === 'signedOut') return <Login />

  return (
    <div className="flex h-full flex-col">
      <Navbar />
      <CanvasSmokeTest />
    </div>
  )
}

/** Neutral on purpose — a splash that resembles the login form defeats the point of
 *  having a loading state at all [R4]. */
function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-100">
      <div className="flex items-center gap-3 text-sm text-neutral-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-500" />
        Loading CollabCanvas…
      </div>
    </div>
  )
}

/**
 * PR 1 smoke test [R18]: one hardcoded blue Rect in a Stage, to prove react-konva
 * renders against React 19. PR 4 replaces this with the real pannable/zoomable Canvas.
 *
 * The Stage is sized from a ResizeObserver rather than a one-shot read of
 * `window.innerWidth`: first paint can happen before layout, and a snapshot taken then
 * pins the canvas at 0×0 for the life of the page.
 */
function CanvasSmokeTest() {
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
    <div ref={containerRef} className="relative min-h-0 flex-1 bg-neutral-100">
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

      {/* Two tabs must show two different ids — that's the R2 keying, verified by eye
          until PR 5 makes it visible as two presence entries. */}
      <p className="absolute right-4 bottom-4 font-mono text-xs text-neutral-400">
        session: {sessionId.slice(0, 8)}
      </p>
    </div>
  )
}

export default App
