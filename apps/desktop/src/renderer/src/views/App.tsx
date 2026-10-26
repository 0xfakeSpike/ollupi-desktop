// Top-level composition: the backend screen until the first sync, then the
// shell with the sidebar and the current screen.

import { useConnection } from '../gateway/connection'
import { useNavigation } from '../domains/navigation'
import { BackendScreen } from './backend/BackendScreen'
import { Toasts } from './common/Toasts'
import { ConversationScreen } from './conversation/ConversationScreen'
import { DraftScreen } from './draft/DraftScreen'
import { MemoryScreen } from './memory/MemoryScreen'
import { SettingsScreen } from './settings/SettingsScreen'
import { Sidebar } from './sidebar/Sidebar'

export function App() {
  const synced = useConnection((s) => s.synced)
  const failed = useConnection((s) => s.backend.status === 'failed')
  // After the first sync the UI stays up through reconnects and restarts
  // (the sidebar shows the connection); only a failed backend takes over.
  return (
    <>
      {synced && !failed ? (
        <div className="flex h-full">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col bg-canvas">
            <CurrentScreen />
          </main>
        </div>
      ) : (
        <BackendScreen />
      )}
      <Toasts />
    </>
  )
}

function CurrentScreen() {
  const screen = useNavigation((s) => s.screen)
  switch (screen.kind) {
    case 'draft':
      return <DraftScreen workspaceId={screen.workspaceId} />
    case 'thread':
      return <ConversationScreen key={screen.threadId} threadId={screen.threadId} />
    case 'memory':
      return <MemoryScreen />
    case 'settings':
      return <SettingsScreen />
  }
}
