// Agent Skills: folders in the folder config.yaml's skills_dir names, each with
// a SKILL.md the agent can activate. The main process owns the folder and
// checks every change with the agent's own catalog; the agent loads skills
// only at start, so a change restarts the backend.

import type { NewSkill, SkillChange, SkillList } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { t } from '../i18n'
import { desktop } from '../platform/desktop'
import { applyConfig, confirmRestart } from './backendConfig'
import { notify } from './notices'
import { useTools } from './tools'

export function readSkills(): Promise<SkillList | undefined> {
  return run((e) => e.skills.load, () => desktop.skills.list())
}

export function readSkillFile(name: string): Promise<string | undefined> {
  return run((e) => e.skills.read, () => desktop.skills.read(name))
}

/** The agent's rule for a skill name, which is also its folder's name. */
export function nameError(name: string, taken: string[]): 'format' | 'taken' | undefined {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) return 'format'
  if (taken.includes(name)) return 'taken'
  return undefined
}

/** Resolves to the refusal, or undefined when nothing was asked of the
 * backend; the dialog shows a refusal where the skill is written. */
export async function createSkill(skill: NewSkill): Promise<SkillChange | undefined> {
  if (!confirmRestart()) return undefined
  return run((e) => e.skills.save, () => desktop.skills.create(skill))
}

export async function saveSkill(name: string, text: string): Promise<SkillChange | undefined> {
  if (!confirmRestart()) return undefined
  return run((e) => e.skills.save, () => desktop.skills.save(name, text))
}

/** Resolves to whether a folder was copied in. */
export async function importSkill(): Promise<boolean> {
  if (!confirmRestart()) return false
  const result = await run((e) => e.skills.save, () => desktop.skills.import())
  if (result && !result.ok) notify(t().errors.skillsUnchanged(result.error))
  return !!result?.ok
}

export async function removeSkill(name: string): Promise<boolean> {
  if (!confirmRestart()) return false
  return run((e) => e.skills.remove, async () => {
    await desktop.skills.remove(name)
    return true
  }).then(Boolean)
}

/** Points skills_dir at a folder in the backend's data folder, making it. */
export async function turnOn(): Promise<boolean> {
  const value = await run((e) => e.skills.save, () => desktop.skills.defaultFolder())
  return value !== undefined && !!(await applyConfig([{ kind: 'set', path: ['skills_dir'], value }]))
}

export async function chooseFolder(): Promise<boolean> {
  const dir = await desktop.pickDirectory()
  return dir !== undefined && !!(await applyConfig([{ kind: 'set', path: ['skills_dir'], value: dir }]))
}

/** Leaves the folder as it is. */
export async function turnOff(): Promise<boolean> {
  return !!(await applyConfig([{ kind: 'delete', path: ['skills_dir'] }]))
}

/** The skills the running agent loaded, as its activate_skill tool offers
 * them; undefined when it started with skills off. */
export function useLoadedSkills(): string[] | undefined {
  const tool = useTools((s) => s.list.find((t) => t.provider === 'skills' && t.name === 'activate_skill'))
  if (!tool) return undefined
  return (tool.input_schema.properties as { name?: { enum?: string[] } } | undefined)?.name?.enum ?? []
}
