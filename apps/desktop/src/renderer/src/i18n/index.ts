// The app's words in each interface language. Each area of the app keeps
// its own catalog (messages/<area>.ts): an English one, and a Chinese one
// that must have the same keys and parameters, so a missing translation
// does not compile. Views read the current catalog with useT(); code
// outside React, such as a failed action's notice, with t().

import { useLocale, type Locale } from './locale'
import * as capabilities from './messages/capabilities'
import * as common from './messages/common'
import * as conversation from './messages/conversation'
import * as cron from './messages/cron'
import * as errors from './messages/errors'
import * as memory from './messages/memory'
import * as requests from './messages/requests'
import * as settings from './messages/settings'
import * as shell from './messages/shell'
import * as skills from './messages/skills'

const en = {
  common: common.en,
  shell: shell.en,
  conversation: conversation.en,
  requests: requests.en,
  memory: memory.en,
  skills: skills.en,
  capabilities: capabilities.en,
  cron: cron.en,
  settings: settings.en,
  errors: errors.en,
}

export type Messages = typeof en

const catalogs: Record<Locale, Messages> = {
  en,
  'zh-CN': {
    common: common.zh,
    shell: shell.zh,
    conversation: conversation.zh,
    requests: requests.zh,
    memory: memory.zh,
    skills: skills.zh,
    capabilities: capabilities.zh,
    cron: cron.zh,
    settings: settings.zh,
    errors: errors.zh,
  },
}

export function useT(): Messages {
  return catalogs[useLocale((s) => s.locale)]
}

/** The current catalog, for code outside React. Read it when the words
 * are needed, not once at load, so a language change applies. */
export function t(): Messages {
  return catalogs[useLocale.getState().locale]
}

export { setLanguage, useLocale, type LanguagePreference } from './locale'
