// The profiles this app presents: ollupi's users, each with the name people
// see it by. The window acts as the profile its token names (the backend
// state says which). The operator's connection lists every profile and
// makes and names them (user/list, user/create, user/update); any other
// connection knows only its own (user/read) and may rename it. Switching
// asks the main process for a token named by the profile; the session then
// reconnects and every profile-scoped domain starts from nothing.

import { errorMessage, RpcError, type OllupiClient } from '@ollupi/client'
import { ErrorCode, type UserChangedNotification, type UserRow } from '@ollupi/protocol'
import { create } from 'zustand'
import type { Profile } from '../../../shared/ipc'
import { gateway, useConnection } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { t } from '../i18n'
import { desktop } from '../platform/desktop'
import { resetForProfile } from './navigation'
import { notify } from './notices'

interface ProfileStore {
  /** Every profile for the operator's connection; only its own for another. */
  list: Profile[]
  current: string | undefined
  /** Whether this connection may make profiles and see every one. */
  operator: boolean
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

export const useProfile = create<ProfileStore>()(() => ({ list: [], current: kept(), operator: false }))

/** The commit the list holds: a change at or before it is in it already. */
let seen = 0

const profileOf = (u: UserRow): Profile => ({ id: u.id, name: u.name })

function changed({ user, seq }: UserChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useProfile.setState((s) => {
    const rest = s.list.filter((p) => p.id !== user.id)
    return { list: sorted([...rest, profileOf(user)]) }
  })
}

const sorted = (list: Profile[]) => list.sort((a, b) => a.id.localeCompare(b.id))

async function read(client: OllupiClient): Promise<void> {
  const backend = useConnection.getState().backend
  const current = backend?.status === 'ready' ? backend.profile : undefined
  const before = useProfile.getState().current
  if (current && before !== current) {
    // The main process stood in another profile (the chosen one is gone):
    // nothing of the old one's stays on screen.
    keep(current)
    useProfile.setState({ current })
    resetForProfile()
  }
  try {
    const { result, newer } = await client.snapshot('user/list', {}, ['user/changed'])
    seen = result.seq
    useProfile.setState({ list: sorted((result.data ?? []).map(profileOf)), operator: true })
    newer.forEach((e) => changed(e.params))
  } catch (err) {
    if (!(err instanceof RpcError && err.code === ErrorCode.forbidden)) throw err
    const { user } = await client.call('user/read', {})
    useProfile.setState({ list: [profileOf(user)], operator: false })
  }
}

export const profileDomain: Domain = {
  bind: (client) => client.on('user/changed', changed),
  sync: read,
  disconnect: () => {
    seen = 0
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

/** Makes a profile. It runs on the deployment's models like every profile,
 * and starts with its own settings, conversations and memory empty. */
export async function createProfile(name: string): Promise<Profile> {
  const { user } = await gateway().call('user/create', { name })
  return profileOf(user)
}

export async function renameProfile(profile: Profile, name: string): Promise<void> {
  await gateway().call('user/update', { id: profile.id, name })
}

export async function deleteProfile(profile: Profile): Promise<void> {
  const { current, list } = useProfile.getState()
  if (current === profile.id) {
    const next = list.find((p) => p.id !== profile.id)
    if (!next) throw new Error('the last profile cannot be deleted')
    await switchProfile(next.id)
  }
  await desktop.profile.delete(profile.id)
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

/** Says why a change to a profile did not happen. */
export function profileFailed(err: unknown): void {
  notify(t().errors.failed(t().errors.profile.save, errorMessage(err)))
}
