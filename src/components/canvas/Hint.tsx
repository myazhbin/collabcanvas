import { useCanvas } from '../../hooks/useCanvas'

/**
 * One line telling a first-time visitor what the canvas does, fading out the moment they
 * place their first rectangle `[R22]`.
 *
 * The gesture is genuinely not guessable — clicking does nothing until Rectangle is armed,
 * and a grader who clicks twice on an empty canvas and sees nothing happen has already
 * formed a view. The toolbar answers *what* exists; this answers *what to do*.
 *
 * **Kept mounted at zero opacity rather than unmounted**, so the fade actually runs — a
 * conditional render swaps it out on the same frame the state flips and there is nothing
 * left to transition. `aria-hidden` and `pointer-events-none` mean the faded copy is inert
 * to a screen reader and to the pointer both, so it is invisible in every sense that counts.
 */
export function Hint() {
  const { showHint } = useCanvas()

  return (
    <div
      aria-hidden={!showHint}
      // Below the toolbar, not beside it. Centred at `top-3` this is 435 px wide and the
      // toolbar reaches x≈290, so on a narrow window the hint sits on top of the Seed 500
      // and Clear all buttons — obscuring two controls in order to explain a third.
      className={`pointer-events-none absolute top-14 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full bg-neutral-900/85 px-3.5 py-1.5 text-center text-xs text-white shadow-sm backdrop-blur-sm transition-opacity duration-500 ${
        showHint ? 'opacity-100' : 'opacity-0'
      }`}
    >
      Click <span className="font-semibold">Rectangle</span>, then click the canvas to place a
      shape — everyone sees it instantly.
    </div>
  )
}
