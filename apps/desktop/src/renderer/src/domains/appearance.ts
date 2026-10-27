// How the app looks: its palette and whether it is light or dark, the
// user's choice kept in this app's own storage. The palette is <html
// data-palette> (theme.css); the scheme is the window's, which
// prefers-color-scheme follows.

import { defaultPalette, palettes, type Palette } from '@ollupi/ui'
import { create } from 'zustand'
import { colorSchemes, type ColorScheme } from '../../../shared/ipc'
import { desktop } from '../platform/desktop'

const PALETTE_KEY = 'ollupi.palette'
const SCHEME_KEY = 'ollupi.colorScheme'

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = localStorage.getItem(key)
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

export const useAppearance = create<{ palette: Palette; scheme: ColorScheme }>()(() => ({ palette: defaultPalette, scheme: 'system' }))

/** Applies the stored choice. Called once when the window loads. */
export function startAppearance(): void {
  const palette = stored(PALETTE_KEY, palettes, defaultPalette)
  const scheme = stored(SCHEME_KEY, colorSchemes, 'system')
  useAppearance.setState({ palette, scheme })
  document.documentElement.dataset.palette = palette
  void desktop.setColorScheme(scheme)
}

export function setPalette(palette: Palette): void {
  localStorage.setItem(PALETTE_KEY, palette)
  document.documentElement.dataset.palette = palette
  useAppearance.setState({ palette })
}

export function setColorScheme(scheme: ColorScheme): void {
  localStorage.setItem(SCHEME_KEY, scheme)
  useAppearance.setState({ scheme })
  void desktop.setColorScheme(scheme)
}
