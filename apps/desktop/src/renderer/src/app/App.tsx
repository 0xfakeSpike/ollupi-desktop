// Top-level composition: the backend gate decides whether the workspace UI
// can show; the shell lays out sidebar and the current screen.

import { Toasts } from '../components/Toasts'
import { BackendScreen } from '../features/backend/BackendScreen'
import { ConversationScreen } from '../features/conversation/ConversationScreen'
import { DraftScreen } from '../features/conversation/DraftScreen'
import { MemoryScreen } from '../features/memory/MemoryScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { Sidebar } from '../features/sidebar/Sidebar'
import { useCatalog } from '../stores/catalog'
import { useConnection } from '../stores/connection'
import { useNavigation } from '../stores/navigation'

export function App() {
  const backend = useConnection((s) => s.backend.status)
  const loaded = useCatalog((s) => s.loaded)
  // Once the catalog has loaded, keep the UI up across reconnects and backend
  // restarts (the sidebar shows the connection state); only a failure takes over.
  return (
    <>
      {loaded && backend !== 'failed' ? <Shell /> : <BackendScreen />}
      <Toasts />
    </>
  )
}

function Shell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col bg-canvas">
        <CurrentScreen />
      </main>
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
    case 'memory':
      return <MemoryScreen />
    case 'settings':
      return <SettingsScreen />
  }
}
