import { errorMessage } from '@ollupi/client'
import { notify } from '../domains/notices'

/** Runs a user action and turns a failure into a notice. Resolves to the
 * action's result, or undefined when it failed. */
export async function run<T>(what: string, action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action()
  } catch (err) {
    notify(`${what}: ${errorMessage(err)}`)
    return undefined
  }
}
