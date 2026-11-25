// The profile's Agent Skills, kept in ollupi's store and given to agents
// (ollupi's roles). ollupi checks a skill when it is set and tells every
// client of the change (skill/changed); the agent reads its skills on each
// turn, so a change applies from the next one without a restart. A skill
// is stored as fields, not a SKILL.md: a folder is read on this Mac only to
// import one (desktop.skills.import).

import type { OllupiClient } from '@ollupi/client'
import { errorMessage } from '@ollupi/client'
import type { SkillChangedNotification, SkillFile, SkillReadResult, SkillRow, SkillSetParams } from '@ollupi/protocol'
import { create } from 'zustand'
import { agentsOf, rolesOf, type SkillAgent, type SkillFolder } from '../../../shared/ipc'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { run } from '../gateway/run'
import { t } from '../i18n'
import { desktop } from '../platform/desktop'
import { notify } from './notices'

/** Undefined until read on a connection. */
export const useSkills = create<{ list: SkillRow[] | undefined }>()(() => ({ list: undefined }))

/** The commit the list holds: a change at or before it is in it already. */
let seen = 0

function changed({ name, skill, seq }: SkillChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useSkills.setState((s) => {
    if (!s.list) return s
    const rest = s.list.filter((x) => x.name !== name)
    return { list: skill ? sorted([...rest, skill]) : rest }
  })
}

const sorted = (list: SkillRow[]) => list.sort((a, b) => a.name.localeCompare(b.name))

async function read(client: OllupiClient): Promise<void> {
  const { result, newer } = await client.snapshot('skill/list', {}, ['skill/changed'])
  seen = result.seq
  useSkills.setState({ list: sorted(result.data) })
  newer.forEach((e) => changed(e.params))
}

export const skillsDomain: Domain = {
  bind: (client) => client.on('skill/changed', changed),
  sync: (client) => read(client),
  disconnect: () => {
    seen = 0
    useSkills.setState({ list: undefined })
  },
}

/** The skills of the main agent, which a new conversation runs as. */
export function mainSkills(list: SkillRow[]): SkillRow[] {
  return list.filter((s) => agentsOf(s.heldBy).includes('main'))
}

/** ollupi's rule for a skill's name. */
export function nameError(name: string, taken: string[]): 'format' | 'taken' | undefined {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) return 'format'
  if (taken.includes(name)) return 'taken'
  return undefined
}

/** A skill as the dialog writes it: what the agent is told, the agents it
 * is given to, and the files it carries, which the app keeps as they came. */
export interface SkillFields {
  name: string
  description: string
  version?: string
  instructions: string
  agents: SkillAgent[]
  files: SkillFile[]
}

/** The skill with its instructions and files, for the dialog to edit. */
export async function readSkill(name: string): Promise<SkillFields | undefined> {
  const read: SkillReadResult | undefined = await run((e) => e.skills.read, () => gateway().call('skill/read', { name }))
  if (!read) return undefined
  const { skill, instructions, files } = read
  return { name: skill.name, description: skill.description, version: skill.version, instructions, agents: agentsOf(skill.roles), files: files ?? [] }
}

/** A folder the person picks, read as a new skill's fields given to the
 * main agent; undefined when none was picked or it could not be read,
 * which a notice says. skipped are its files ollupi keeps none of. */
export async function importFolder(): Promise<{ fields: SkillFields; skipped: string[] } | undefined> {
  const folder: SkillFolder | undefined = await run((e) => e.skills.import, () => desktop.skills.import())
  if (!folder) return undefined
  if (!folder.ok || !folder.skill) {
    notify(t().errors.failed(t().errors.skills.import, folder.error ?? ''))
    return undefined
  }
  const s = folder.skill
  return {
    fields: { name: s.name, description: s.description, version: s.version, instructions: s.instructions, agents: ['main'], files: s.files ?? [] },
    skipped: folder.skipped ?? [],
  }
}

/** Saved, or ollupi's refusal in its own words, which the dialog shows
 * where the skill is written. */
export type SkillChange = { ok: true } | { ok: false; error: string }

/** Sets the skill whole: its fields, agents and files replace what it had. */
export async function saveSkill(f: SkillFields): Promise<SkillChange> {
  const params: SkillSetParams = {
    name: f.name,
    description: f.description.trim(),
    ...(f.version && { version: f.version }),
    instructions: f.instructions.trim(),
    roles: f.agents.flatMap(rolesOf),
    ...(f.files.length && { files: f.files }),
  }
  try {
    await gateway().call('skill/set', params)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export function removeSkill(name: string): Promise<boolean> {
  return run((e) => e.skills.remove, async () => {
    await gateway().call('skill/delete', { name })
    return true
  }).then(Boolean)
}
