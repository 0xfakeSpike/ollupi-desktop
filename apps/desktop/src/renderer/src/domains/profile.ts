// The profiles of this home: every one the backend holds, and the one this
// connection acts as. There is always one — the backend names every
// connection by a profile it holds. Switching asks the main process, which
// keeps the choice and hands the renderer a token for it; the session then
// reconnects under that name and every domain syncs from scratch.

import type { UserRow } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { desktop } from '../platform/desktop'
import { go } from './navigation'

interface ProfileStore {
  list: UserRow[]
  current: string | undefined
}

/** The last profile the window opened as. Kept here as well as in the main
 * process so a draft is that profile's from the first frame, before the
 * connection has synced. */
const KEPT = 'ollupi.profile'

function kept(): string | undefined {
  try {
    return localStorage.getItem(KEPT) ?? undefined
  } catch {
    return undefined
  }
}

function keep(id: string | undefined): void {
  try {
    if (id) localStorage.setItem(KEPT, id)
  } catch {
    // A window that cannot keep it still works: the sync sets it again.
  }
}

export const useProfile = create<ProfileStore>()(() => ({ list: [], current: kept() }))

export const profileDomain: Domain = {
  sync: async (client) => {
    const { data, current } = await client.call('user/list', {})
    keep(current)
    useProfile.setState({ list: data, current })
  },
}

/** The profile this connection acts as. */
export function currentProfile(): UserRow | undefined {
  const { list, current } = useProfile.getState()
  return list.find((p) => p.id === current)
}

/** What to call a profile: its name, or what the interface calls one that
 * has none yet. */
export function profileName(profile: UserRow | undefined, unnamed: string): string {
  return profile?.name.trim() || unnamed
}

async function sync(): Promise<void> {
  const { data, current } = await gateway().call('user/list', {})
  useProfile.setState({ list: data, current })
}

/** Makes a profile in the store and returns it. Its models are written to
 * config.yaml by whoever makes it, since only there can they be its own. */
export async function createProfile(name: string, color: string): Promise<UserRow> {
  const { user } = await gateway().call('user/create', { name, color })
  await sync()
  return user
}

export async function renameProfile(id: string, name: string): Promise<void> {
  await gateway().call('user/rename', { userId: id, name })
  await sync()
}

export async function recolorProfile(id: string, color: string): Promise<void> {
  await gateway().call('user/color', { userId: id, color })
  await sync()
}

/** Makes another profile the window's. A conversation of the old one is not
 * the new one's to show, so the window opens on the new profile's draft. */
export async function switchProfile(id: string): Promise<void> {
  if (useProfile.getState().current === id) return
  // The window opens on the new profile at once — its draft, its boxes — so a
  // reconnect has nothing of the old one's on screen.
  keep(id)
  useProfile.setState({ current: id })
  go({ kind: 'draft', workspaceId: undefined })
  await desktop.profile.select(id)
}
