// Top-level composition: the backend screen until the first sync, then the
// shell with the sidebar and the current screen.

import { useConnection } from '../gateway/connection'
import { useEffect } from 'react'
import { go, useNavigation } from '../domains/navigation'
import { useT } from '../i18n'
import { BackendScreen } from './backend/BackendScreen'
import { CapabilitiesScreen } from './capabilities/CapabilitiesScreen'
import { Toasts } from './common/Toasts'
import { ConversationScreen } from './conversation/ConversationScreen'
import { DraftScreen } from './draft/DraftScreen'
import { CronScreen } from './cron/CronScreen'
import { MemoryScreen } from './memory/MemoryScreen'
import { SearchScreen } from './search/SearchScreen'
import { SettingsScreen } from './settings/SettingsScreen'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  useSearchShortcut()
  const synced = useConnection((s) => s.synced)
  const failed = useConnection((s) => s.backend.status === 'failed')
  // After the first sync the UI stays up through reconnects and restarts
  // (the sidebar shows the connection); only a failed backend takes over.
  return (
    <>
      {synced && !failed ? (
        // The sidebar sits on the window's ground; the screen fills the
        // rest of the window, divided from it by a line.
        <div className="flex h-full flex-col bg-ground">
          <ContractBanner />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-line bg-canvas">
              <CurrentScreen />
            </main>
          </div>
        </div>
      ) : (
        <BackendScreen />
      )}
      <Toasts />
    </>
  )
}

/** ⌘K opens search from anywhere, as in most Mac apps. */
function useSearchShortcut(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        go({ kind: 'search' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** The backend serves a different contract than the UI was built from, so
 * the UI's types may not describe what it receives. */
function ContractBanner() {
  const mismatch = useConnection((s) => s.contractMismatch)
  const m = useT()
  if (!mismatch) return null
  return (
    <div className="drag flex shrink-0 items-center justify-center gap-2 border-b border-line px-4 py-1.5 pl-24 text-small text-warning">
      {m.shell.contractBanner(mismatch.server.slice(0, 8), mismatch.ui.slice(0, 8))}
    </div>
  )
}

function CurrentScreen() {
  const screen = useNavigation((s) => s.screen)
  switch (screen.kind) {
    case 'draft':
      return <DraftScreen workspaceId={screen.workspaceId} />
    case 'thread':
      return <ConversationScreen key={screen.threadId} threadId={screen.threadId} />
    case 'search':
      return <SearchScreen />
    case 'memory':
      return <MemoryScreen found={screen.found} />
    case 'cron':
      return <CronScreen found={screen.found} />
    case 'capabilities':
      return <CapabilitiesScreen tab={screen.tab} />
    case 'settings':
      return <SettingsScreen tab={screen.tab} />
  }
}
