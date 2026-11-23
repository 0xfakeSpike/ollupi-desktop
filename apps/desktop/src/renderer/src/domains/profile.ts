// The profiles this app presents: their ids come from the backend config,
// while names and colours live in the main process. Switching asks the main
// process for a token named by the profile; the session then reconnects and
// every profile-scoped domain starts from nothing.

import type { Profile, ProfileColor } from '../../../shared/ipc'
import { create } from 'zustand'
import type { Domain } from '../gateway/domain'
import { desktop } from '../platform/desktop'
import { resetForProfile } from './navigation'

interface ProfileStore {
  list: Profile[]
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
  sync: async () => {
    const before = useProfile.getState().current
    const { data, current } = await desktop.profile.list()
    keep(current)
    useProfile.setState({ list: data, current })
    if (before && before !== current) {
      await desktop.profile.select(current)
      throw new Error('profile changed')
    }
  },
}

/** The profile this connection acts as. */
export function currentProfile(): Profile | undefined {
  const { list, current } = useProfile.getState()
  return list.find((p) => p.id === current)
}

/** What to call a profile: its name, or what the interface calls one that
 * has none yet. */
export function profileName(profile: Profile | undefined, unnamed: string): string {
  return profile?.name.trim() || unnamed
}

async function sync(): Promise<void> {
  const { data, current } = await desktop.profile.list()
  useProfile.setState({ list: data, current })
}

/** Adds a profile to the app and config.yaml, with the current profile's
 * models and memory setting. */
export async function createProfile(name: string, color: ProfileColor): Promise<Profile> {
  const user = await desktop.profile.create(name, color)
  await sync()
  return user
}

export async function updateProfile(profile: Profile, name: string, color: ProfileColor): Promise<void> {
  await desktop.profile.update(profile.id, name, color)
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
  resetForProfile()
  desktop.presence.context(null)
  await desktop.profile.select(id)
}
