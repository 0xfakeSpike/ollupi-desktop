// The app's own updates. The main process checks for a newer release and
// downloads one only once the person agrees; this keeps its state, and the
// version the person put off, which the prompt then leaves alone in this
// window. Settings still offer it.

import { create } from 'zustand'
import type { UpdateState } from '../../../shared/ipc'
import { desktop } from '../platform/desktop'

export const useUpdate = create<{ state: UpdateState; putOff: string | undefined }>()(() => ({
  state: { status: 'unsupported' },
  putOff: undefined,
}))

/** Follows the main process's state. Called once when the window loads. */
export function startUpdate(): void {
  desktop.update.onState((state) => useUpdate.setState({ state }))
  void desktop.update.state().then((state) => useUpdate.setState({ state }))
}

export function putOff(version: string): void {
  useUpdate.setState({ putOff: version })
}

/** The release an update in progress is for, if any. */
export function updateVersion(state: UpdateState): string | undefined {
  return 'version' in state ? state.version : undefined
}
