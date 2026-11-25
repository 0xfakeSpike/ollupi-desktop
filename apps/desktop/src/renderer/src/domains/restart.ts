// Restarting the backend this Mac runs, as changing a profile or the
// connection does.

import { isWorking } from '@ollupi/core'
import { t } from '../i18n'
import { useThreads } from './threads'

/** A restart stops commands that are executing (ollupi marks them as
 * possibly done), so with threads running it asks first. */
export function confirmRestart(): boolean {
  const running = useThreads.getState().list.filter((t) => isWorking(t.status)).length
  return !running || confirm(t().common.restartRunning(running))
}
