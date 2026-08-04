import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './hooks/useAuth'
import { Login } from './components/auth/Login'
import { Canvas } from './components/canvas/Canvas'
import { Navbar } from './components/layout/Navbar'

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
      <Canvas />
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

export default App
