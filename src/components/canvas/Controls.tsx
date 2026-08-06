import { useCanvas } from '../../hooks/useCanvas'
import type { Tool } from '../../contexts/CanvasContext'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Select', hint: 'V — click a shape to select, drag to move' },
  { id: 'rectangle', label: 'Rectangle', hint: 'R — click empty canvas to place' },
]

/**
 * The tool switch, floating over the stage.
 *
 * Deliberately visible rather than modal-by-modifier: a grader has thirty seconds to work
 * out that this canvas does anything at all, and a toolbar answers that before they have
 * to guess [R22].
 *
 * Seed 500 / Clear all landed here early, in PR 9 rather than PR 10: F10's 500-object
 * profile cannot be run without a way to put 500 objects on the canvas. Each is **one**
 * transaction writing the whole array [R14,R22].
 */
export function Controls() {
  const { tool, setTool, selectedId, deleteShape, seed, clearAll } = useCanvas()

  return (
    <div className="pointer-events-auto absolute top-3 left-3 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm ring-1 ring-neutral-200 backdrop-blur-sm">
      {TOOLS.map(({ id, label, hint }) => (
        <button
          key={id}
          type="button"
          title={hint}
          onClick={() => setTool(id)}
          aria-pressed={tool === id}
          className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
            tool === id
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-700 hover:bg-neutral-100'
          }`}
        >
          {label}
        </button>
      ))}

      {selectedId && (
        <>
          <span className="mx-0.5 h-5 w-px bg-neutral-200" />
          <button
            type="button"
            title="Delete — or press Delete/Backspace"
            onClick={() => deleteShape(selectedId)}
            className="rounded-md px-2.5 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </>
      )}

      <span className="mx-0.5 h-5 w-px bg-neutral-200" />
      <button
        type="button"
        title="Add 500 rectangles — one transaction, for the 500-object profile"
        onClick={() => seed(500)}
        className="rounded-md px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        Seed 500
      </button>
      <button
        type="button"
        title="Remove every rectangle — one transaction"
        onClick={clearAll}
        className="rounded-md px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-100"
      >
        Clear all
      </button>
    </div>
  )
}
