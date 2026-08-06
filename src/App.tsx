import { AuthProvider } from './contexts/AuthContext'
import { CanvasProvider } from './contexts/CanvasContext'
import { useAuth } from './hooks/useAuth'
import { usePresence } from './hooks/usePresence'
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

function AuthGate() {
  const { status } = useAuth()

  if (status === 'loading') return <Splash />
  if (status === 'signedOut') return <Login />

  return <CanvasScreen />
}

function CanvasScreen() {
  const { online, sessions } = usePresence()

  return (
    <CanvasProvider>
      <div className="flex h-full flex-col">
        <Navbar online={online} />
        <Canvas sessions={sessions} />
      </div>
    </CanvasProvider>
  )
}

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
