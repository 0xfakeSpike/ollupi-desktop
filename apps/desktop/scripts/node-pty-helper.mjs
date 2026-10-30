// node-pty 1.1.0 publishes its macOS spawn-helper without the execute bit,
// so every terminal fails with "posix_spawnp failed". Sets it after each
// install, before development runs or packaging copies the file.

import { chmodSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const root = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'))
for (const arch of ['darwin-arm64', 'darwin-x64']) {
  const helper = join(root, 'prebuilds', arch, 'spawn-helper')
  if (existsSync(helper)) chmodSync(helper, 0o755)
}
