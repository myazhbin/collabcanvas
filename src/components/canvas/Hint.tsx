import { useCanvas } from '../../hooks/useCanvas'

export function Hint() {
  const { showHint } = useCanvas()

  return (
    <div
      aria-hidden={!showHint}
      className={`pointer-events-none absolute top-14 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full bg-neutral-900/85 px-3.5 py-1.5 text-center text-xs text-white shadow-sm backdrop-blur-sm transition-opacity duration-500 ${
        showHint ? 'opacity-100' : 'opacity-0'
      }`}
    >
      Click <span className="font-semibold">Rectangle</span>, then click the canvas to place a
      shape — everyone sees it instantly.
    </div>
  )
}
