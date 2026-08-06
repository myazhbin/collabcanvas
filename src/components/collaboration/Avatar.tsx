export const AVATAR_CLASS =
  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold'

const RINGS = {
  none: '',
  white: 'ring-2 ring-white',
  dark: 'ring-2 ring-neutral-900',
}

export function Avatar({
  name,
  colour,
  ring = 'none',
  title,
}: {
  name: string
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

function initial(name: string): string {
  return name?.trim()?.[0]?.toUpperCase() ?? '?'
}
