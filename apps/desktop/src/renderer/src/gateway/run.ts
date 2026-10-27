import { errorMessage } from '@ollupi/client'
import { notify } from '../domains/notices'
import { t, type Messages } from '../i18n'

/** Runs a user action and turns a failure into a notice, saying what the
 * action was (picked from the errors catalog when it fails). Resolves to
 * the action's result, or undefined when it failed. */
export async function run<T>(what: (e: Messages['errors']) => string, action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action()
  } catch (err) {
    const m = t().errors
    notify(m.failed(what(m), errorMessage(err)))
    return undefined
  }
}
