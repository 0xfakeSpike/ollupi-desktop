// How the app looks, the user's choice kept in this app's own storage: the
// theme (theme.css: stone and moss by default, or dusk), set on the root as
// data-theme and on the Dock's icon, and whether it is light or dark. The scheme is the window's,
// which prefers-color-scheme follows; each theme has a palette for both.

import { create } from 'zustand'
import { appThemes, colorSchemes, type AppTheme, type ColorScheme } from '../../../shared/ipc'
import { desktop } from '../platform/desktop'

export const themes = appThemes
export type Theme = AppTheme

const SCHEME_KEY = 'ollupi.colorScheme'
const THEME_KEY = 'ollupi.theme'

function storedScheme(): ColorScheme {
  const v = localStorage.getItem(SCHEME_KEY)
  return v && (colorSchemes as readonly string[]).includes(v) ? (v as ColorScheme) : 'system'
}

function storedTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY)
  return v && (themes as readonly string[]).includes(v) ? (v as Theme) : 'stone'
}

export const useAppearance = create<{ scheme: ColorScheme; theme: Theme }>()(() => ({ scheme: 'system', theme: 'stone' }))

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  void desktop.setAppIcon(theme)
}

/** Applies the stored choices. Called once when the window loads. */
export function startAppearance(): void {
  const scheme = storedScheme()
  const theme = storedTheme()
  useAppearance.setState({ scheme, theme })
  applyTheme(theme)
  void desktop.setColorScheme(scheme)
}

export function setColorScheme(scheme: ColorScheme): void {
  localStorage.setItem(SCHEME_KEY, scheme)
  useAppearance.setState({ scheme })
  void desktop.setColorScheme(scheme)
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme)
  useAppearance.setState({ theme })
  applyTheme(theme)
}
