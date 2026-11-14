// Agent Skills: folders in the folder config.yaml's skills_dir names, each with
// a SKILL.md an agent can activate. Each agent has skills of its own.
// The main process owns the folder and checks every change with the agent's
// own rules; the agent reads skills on each run, so a change takes effect
// from the next one without a restart. Turning skills on or off, or moving
// the folder, is a change to config.yaml, which does restart.

import type { NewSkill, SkillAgent, SkillChange, SkillList } from '../../../shared/ipc'
import { run } from '../gateway/run'
import { t } from '../i18n'
import { desktop } from '../platform/desktop'
import { applyConfig } from './backendConfig'
import { notify } from './notices'

export function readSkills(): Promise<SkillList | undefined> {
  return run((e) => e.skills.load, () => desktop.skills.list())
}

export function readSkillFile(agent: SkillAgent, name: string): Promise<string | undefined> {
  return run((e) => e.skills.read, () => desktop.skills.read(agent, name))
}

/** The agent's rule for a skill name, which is also its folder's name. */
export function nameError(name: string, taken: string[]): 'format' | 'taken' | undefined {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) return 'format'
  if (taken.includes(name)) return 'taken'
  return undefined
}

/** Resolves to the refusal, or undefined when the backend could not be
 * asked; the dialog shows a refusal where the skill is written. */
export function createSkill(agent: SkillAgent, skill: NewSkill): Promise<SkillChange | undefined> {
  return run((e) => e.skills.save, () => desktop.skills.create(agent, skill))
}

export function saveSkill(agent: SkillAgent, name: string, text: string): Promise<SkillChange | undefined> {
  return run((e) => e.skills.save, () => desktop.skills.save(agent, name, text))
}

/** Resolves to whether a folder was copied in. */
export async function importSkill(agent: SkillAgent): Promise<boolean> {
  return settled(await run((e) => e.skills.save, () => desktop.skills.import(agent)))
}

/** Resolves to whether the other agent got its copy. */
export async function copySkill(agent: SkillAgent, name: string, to: SkillAgent): Promise<boolean> {
  return settled(await run((e) => e.skills.save, () => desktop.skills.copy(agent, name, to)))
}

export function removeSkill(agent: SkillAgent, name: string): Promise<boolean> {
  return run(
    (e) => e.skills.remove,
    async () => {
      await desktop.skills.remove(agent, name)
      return true
    },
  ).then(Boolean)
}

/** A change with no dialog to show its refusal in says it in a notice. */
function settled(result: SkillChange | undefined): boolean {
  if (result && !result.ok) notify(t().errors.skillsUnchanged(result.error))
  return !!result?.ok
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
