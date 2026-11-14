// The skills folder config.yaml names (skills_dir), owned by the main
// process like config.yaml. A skill belongs to an agent: ollupi keeps each
// role's skills in the directory of the role's name
// (skills_dir/<role>/<skill>/SKILL.md), and the app's agents are those roles,
// the main agent being both of its own (see rolesOf). ollupi reads skills on
// each run but will not start with a folder holding a skill it cannot load,
// so a change is put together in a staging folder first and checked with
// the agent's own rules (ollupid --check-skills); only one that passes
// reaches the folder, and it takes effect from the next run.

import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { AgentRole } from '@ollupi/protocol'
import { stringify } from 'yaml'
import { rolesOf, skillAgents, type AgentSkills, type NewSkill, type Skill, type SkillAgent, type SkillChange, type SkillList } from '../../shared/ipc'
import type { SkillsCheck } from '../../shared/generated/backend-skills'

export interface SkillsOptions {
  binary: string
  home: string
  trash(path: string): Promise<void>
}

/** skills_dir's value for the folder in the backend's home. */
const defaultFolder = 'skills'

/** What --list-skills and --check-skills say: each role's skills. */
type RoleList = { ok: true; dir: string; roles: Map<AgentRole, Skill[]> } | { ok: false; dir: string; error: string }

export class BackendSkills {
  constructor(private readonly opts: SkillsOptions) {}

  /** The folder and each agent's skills as the agent would load them. A
   * skill of the main agent is the one in either of its roles. */
  async list(): Promise<SkillList> {
    const list = await this.run(['--list-skills'])
    if (!list.ok) return list
    const agents: AgentSkills[] = skillAgents.map((agent) => {
      const byName = new Map<string, Skill>()
      for (const role of rolesOf(agent)) for (const skill of list.roles.get(role) ?? []) if (!byName.has(skill.name)) byName.set(skill.name, skill)
      return { agent, skills: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)) }
    })
    return { ok: true, dir: list.dir, agents }
  }

  /** The agent's SKILL.md of the skill as written. */
  async read(agent: SkillAgent, name: string): Promise<string> {
    const { dir, roles } = await this.copies(agent, entry(name))
    if (roles.length === 0) throw new Error(`the ${agent} has no skill ${name}`)
    return readFile(join(dir, roles[0]!, name, 'SKILL.md'), 'utf8')
  }

  /** Creates the folder in the backend's home and gives the skills_dir
   * value that names it. */
  async defaultFolder(): Promise<string> {
    await mkdir(join(this.opts.home, defaultFolder), { recursive: true })
    return defaultFolder
  }

  /** A new skill folder of the agent's, holding only its SKILL.md. */
  create(agent: SkillAgent, skill: NewSkill): Promise<SkillChange> {
    const text = `---\n${stringify({ name: skill.name, description: skill.description }, { lineWidth: 0 })}---\n\n${skill.instructions.trim()}\n`
    return this.change(entry(skill.name), rolesOf(agent), {
      async build(staged, target) {
        if (await exists(target)) return `${target} already exists`
        await mkdir(staged, { recursive: true })
        await writeFile(join(staged, 'SKILL.md'), text)
      },
      commit: (staged, target) => rename(staged, target),
    })
  }

  /** Replaces the agent's SKILL.md of the skill; its other files stay. */
  async save(agent: SkillAgent, name: string, text: string): Promise<SkillChange> {
    const { roles } = await this.copies(agent, entry(name))
    if (roles.length === 0) return { ok: false, error: `the ${agent} has no skill ${name}` }
    return this.change(name, roles, {
      async build(staged, target) {
        await cp(target, staged, { recursive: true, verbatimSymlinks: true })
        await writeFile(join(staged, 'SKILL.md'), text)
      },
      commit: (staged, target) => rename(join(staged, 'SKILL.md'), join(target, 'SKILL.md')),
    })
  }

  /** Copies a skill folder in for the agent, under its own name, which the
   * agent requires to be the skill's name. */
  import(agent: SkillAgent, source: string): Promise<SkillChange> {
    return this.change(entry(basename(source)), rolesOf(agent), {
      async build(staged, target) {
        if (await exists(target)) return `${target} already exists`
        await cp(source, staged, { recursive: true, verbatimSymlinks: true })
      },
      commit: (staged, target) => rename(staged, target),
    })
  }

  /** Gives another agent a copy of one agent's skill, its own from then on. */
  async copy(agent: SkillAgent, name: string, to: SkillAgent): Promise<SkillChange> {
    const { dir, roles } = await this.copies(agent, entry(name))
    if (roles.length === 0) return { ok: false, error: `the ${agent} has no skill ${name}` }
    const source = join(dir, roles[0]!, name)
    return this.import(to, source)
  }

  /** Moves the agent's copy of the skill to the Trash; other agents keep
   * theirs. */
  async remove(agent: SkillAgent, name: string): Promise<void> {
    const { dir, roles } = await this.copies(agent, entry(name))
    for (const role of roles) await this.opts.trash(join(dir, role, name))
  }

  /** build stages the skill of each role at staged, or says why it will
   * not; commit moves each to its target once the agent accepts them all. */
  private async change(
    name: string,
    roles: AgentRole[],
    step: { build(staged: string, target: string): Promise<string | void>; commit(staged: string, target: string): Promise<void> },
  ): Promise<SkillChange> {
    const dir = await this.folder()
    // Inside the folder, so the commit is a rename; the agent skips folders
    // whose names start with a dot.
    const root = await mkdtemp(join(dir, '.staging-'))
    try {
      for (const role of roles) {
        await mkdir(join(root, role))
        const refused = await step.build(join(root, role, name), join(dir, role, name))
        if (refused) return { ok: false, error: refused }
      }
      const checked = await this.run(['--check-skills', root])
      // The change is to the folder; staging is only how it is checked.
      if (!checked.ok) return { ok: false, error: checked.error.replaceAll(root, dir) }
      for (const role of roles) {
        await mkdir(join(dir, role), { recursive: true })
        await step.commit(join(root, role, name), join(dir, role, name))
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
    return { ok: true }
  }

  /** The folder, and the agent's roles that have a skill of this name. */
  private async copies(agent: SkillAgent, name: string): Promise<{ dir: string; roles: AgentRole[] }> {
    const list = await this.run(['--list-skills'])
    if (!list.dir) throw new Error(list.ok ? 'config.yaml sets no skills_dir' : list.error)
    if (!list.ok) throw new Error(list.error)
    const roles = rolesOf(agent).filter((role) => list.roles.get(role)?.some((s) => s.name === name))
    return { dir: list.dir, roles }
  }

  private async folder(): Promise<string> {
    const list = await this.run(['--list-skills'])
    if (!list.dir) throw new Error(list.ok ? 'config.yaml sets no skills_dir' : list.error)
    return list.dir
  }

  private run(args: string[]): Promise<RoleList> {
    return new Promise((resolve) => {
      execFile(this.opts.binary, ['--home', this.opts.home, ...args], { timeout: 30_000 }, (err, stdout) => {
        try {
          const out = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as SkillsCheck
          resolve(
            out.ok
              ? { ok: true, dir: out.dir, roles: new Map((out.roles ?? []).map((r) => [r.role as AgentRole, r.skills ?? []])) }
              : { ok: false, dir: out.dir, error: out.error ?? '' },
          )
        } catch {
          resolve({ ok: false, dir: '', error: err ? `cannot read the skills: ${err.message}` : 'cannot read the skills' })
        }
      })
    })
  }
}

/** A skill's folder name comes from the renderer: one entry of a role's
 * folder, not a path. */
function entry(name: string): string {
  if (!name || name !== basename(name) || name.startsWith('.')) throw new Error(`not a skill folder name: ${name}`)
  return name
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}
