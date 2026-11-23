// What Electron can tell the main process about the person's attention: which
// window of the app is in front, whether the machine is locked or asleep, and
// how long since the last keyboard or mouse input. Each signal is normalized
// into one call, so the machine above needs no Electron terms.
//
// Reading the idle clock needs no permission on macOS: the system reports the
// time since the last HID event without naming the key or the application.

import { app, powerMonitor } from 'electron'

export interface Attention {
  /** A window of the app gained or lost the front; the listener is called on each change. */
  onFocus(listener: (focused: boolean) => void): () => void
  /** The screen locked or the machine slept, and the person is active again. */
  onAway(listener: (away: boolean) => void): () => void
  /** Seconds since the last keyboard or mouse input, anywhere on the machine. */
  idleSeconds(): number
}

export function attention(): Attention {
  return {
    onFocus(listener) {
      const gained = () => listener(true)
      const lost = () => listener(false)
      app.on('browser-window-focus', gained)
      app.on('browser-window-blur', lost)
      return () => {
        app.off('browser-window-focus', gained)
        app.off('browser-window-blur', lost)
      }
    },
    onAway(listener) {
      const away = () => listener(true)
      const back = () => listener(false)
      powerMonitor.on('lock-screen', away)
      powerMonitor.on('suspend', away)
      powerMonitor.on('unlock-screen', back)
      powerMonitor.on('resume', back)
      powerMonitor.on('user-did-become-active', back)
      return () => {
        powerMonitor.off('lock-screen', away)
        powerMonitor.off('suspend', away)
        powerMonitor.off('unlock-screen', back)
        powerMonitor.off('resume', back)
        powerMonitor.off('user-did-become-active', back)
      }
    },
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
  }
}
