// The Dock's icon follows the interface's theme while the app runs: stone and
// moss shows the oat icon, dusk the wolf in a dusk sky. The PNGs are the
// brand's (assets/brand/png), packaged under Resources/brand. Finder and
// Launchpad show the bundle's icon, which a running app cannot change.

import { app } from 'electron'
import { join } from 'node:path'
import type { AppTheme } from '../shared/ipc'

export function setAppIcon(theme: AppTheme): void {
  const file = theme === 'dusk' ? 'app-icon-dusk-1024.png' : 'app-icon-1024.png'
  const dir = app.isPackaged ? join(process.resourcesPath, 'brand') : join(app.getAppPath(), '..', '..', 'assets', 'brand', 'png')
  app.dock?.setIcon(join(dir, file))
}
