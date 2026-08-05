/**
 * The 24 px identity circle, shared by the online stack and the navbar's own-user chip.
 *
 * One component so a peer's avatar and your own are the same object on screen — they sit
 * a few pixels apart in the same header, and two implementations of "a small coloured
 * circle with an initial in it" do not stay identical.
 */

/** The shape alone, for the one chip that is not a user: the `+N` overflow counter. */
export const AVATAR_CLASS =
  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold'

const RINGS = {
  none: '',
  /** Separates overlapping avatars in the stack. */
  white: 'ring-2 ring-white',
  /** Marks which one is you. */
  dark: 'ring-2 ring-neutral-900',
}

export function Avatar({
  name,
  colour,
  ring = 'none',
  title,
}: {
  name: string
  /** Undefined only before a user is known — renders a neutral chip rather than black. */
  colour?: string
  ring?: keyof typeof RINGS
  title?: string
}) {
  return (
    <span
      title={title}
      style={{ backgroundColor: colour }}
      className={`${AVATAR_CLASS} text-white ${colour ? '' : 'bg-neutral-200'} ${RINGS[ring]}`}
    >
      {initial(name)}
    </span>
  )
}

/** Never empty: a blank circle reads as a rendering bug, an unfamiliar glyph reads as a
 *  name this app could not parse. */
function initial(name: string): string {
  return name?.trim()?.[0]?.toUpperCase() ?? '?'
}
