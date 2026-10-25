import { errorMessage } from '@ollupi/client'
import { notify } from '../../stores/notices'

/** Runs a user action, turning a failure into a toast instead of an
 * unhandled rejection. Resolves to undefined when the action failed. */
export async function guard<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    notify(`${what}: ${errorMessage(err)}`)
    return undefined
  }
}
