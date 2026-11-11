// Whether the app is light or dark, the user's choice kept in this app's own
// storage. The scheme is the window's, which prefers-color-scheme follows;
// theme.css has one palette for both.

import { create } from 'zustand'
import { colorSchemes, type ColorScheme } from '../../../shared/ipc'
import { desktop } from '../platform/desktop'

const SCHEME_KEY = 'ollupi.colorScheme'

function storedScheme(): ColorScheme {
  const v = localStorage.getItem(SCHEME_KEY)
  return v && (colorSchemes as readonly string[]).includes(v) ? (v as ColorScheme) : 'system'
}

export const useAppearance = create<{ scheme: ColorScheme }>()(() => ({ scheme: 'system' }))

/** Applies the stored choice. Called once when the window loads. */
export function startAppearance(): void {
  const scheme = storedScheme()
  useAppearance.setState({ scheme })
  void desktop.setColorScheme(scheme)
}

export function setColorScheme(scheme: ColorScheme): void {
  localStorage.setItem(SCHEME_KEY, scheme)
  useAppearance.setState({ scheme })
  void desktop.setColorScheme(scheme)
}
