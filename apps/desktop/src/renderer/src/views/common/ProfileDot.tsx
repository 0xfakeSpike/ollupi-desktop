import { profileColor } from './profileColors'

/** A profile's dot: its colour, or the first when it has none yet. */
export function ProfileDot({ color }: { color: string }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: profileColor(color) }} />
}
