// The renderer alone, served by Vite for a browser against a sidecar started
// by hand (platform/desktop.ts's browser shim). electron-vite's
// --rendererOnly still starts Electron, which quits while the installed app
// holds its single-instance lock.

import { defineConfig } from 'vite'
import { renderer } from './electron.vite.config'

export default defineConfig({ ...renderer, server: { port: 5173, strictPort: true } })
