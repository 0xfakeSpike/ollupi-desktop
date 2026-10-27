// The interface language: the user's choice, kept in this app's own storage,
// or the system's. Only the app's own words change; what the user, the
// agent and the backend write is shown as written.

import { create } from 'zustand'

export const locales = ['en', 'zh-CN'] as const
export type Locale = (typeof locales)[number]

/** A chosen locale, or 'system' to follow the system language. */
export type LanguagePreference = 'system' | Locale

const KEY = 'ollupi.language'

/** The system language's locale: Chinese for any zh-*, else English. */
export function systemLocale(languages: readonly string[] = navigator.languages): Locale {
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

function stored(): LanguagePreference {
  const v = localStorage.getItem(KEY)
  return v && (locales as readonly string[]).includes(v) ? (v as Locale) : 'system'
}

const resolve = (p: LanguagePreference): Locale => (p === 'system' ? systemLocale() : p)

/** English until startLocale reads the user's choice. */
export const useLocale = create<{ preference: LanguagePreference; locale: Locale }>()(() => ({ preference: 'system', locale: 'en' }))

/** Applies the stored choice, and follows the system language while the
 * choice is 'system'. Called once when the window loads. */
export function startLocale(): void {
  const preference = stored()
  useLocale.setState({ preference, locale: resolve(preference) })
  window.addEventListener('languagechange', () => {
    if (useLocale.getState().preference === 'system') useLocale.setState({ locale: systemLocale() })
  })
  const mark = () => (document.documentElement.lang = useLocale.getState().locale)
  useLocale.subscribe(mark)
  mark()
}

export function setLanguage(preference: LanguagePreference): void {
  if (preference === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, preference)
  useLocale.setState({ preference, locale: resolve(preference) })
}
