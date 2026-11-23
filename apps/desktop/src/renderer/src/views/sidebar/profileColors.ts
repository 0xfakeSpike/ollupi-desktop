import type { ProfileColor } from '../../../../shared/ipc'

/** The colours a profile may wear, and the dot that shows one. They are the
 * app's presentation values; Ollupi stores only the profile id. The values
 * sit on either scheme, so a dot needs no theme. */
export const PROFILE_COLORS: Record<ProfileColor, string> = {
  stone: '#8b8577',
  amber: '#c08a2e',
  teal: '#2f9385',
  violet: '#7b68c9',
  rose: '#bd6b88',
  sky: '#4a93c4',
}

export function profileColor(name: string): string {
  return (PROFILE_COLORS as Record<string, string>)[name] ?? PROFILE_COLORS.stone
}
