// The skills folder config.yaml names (skills_dir), owned by the main
// process like config.yaml. The agent loads its skills once at start and
// will not start with a folder holding a skill it cannot load, so a change
// is put together in a staging folder first and checked with the agent's
// own catalog (ollupid --check-skills); only one that passes reaches the
// folder, and the backend restarts to load it.

import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { stringify } from 'yaml'
import type { NewSkill, SkillChange, SkillList } from '../../shared/ipc'
import type { SkillsCheck } from '../../shared/generated/backend-skills'

export interface SkillsOptions {
  binary: string
  home: string
  restart(): Promise<void>
  trash(path: string): Promise<void>
}

/** skills_dir's value for the folder in the backend's home. */
const defaultFolder = 'skills'

export class BackendSkills {
  constructor(private readonly opts: SkillsOptions) {}

  /** The folder and its skills as the agent would load them. */
  list(): Promise<SkillList> {
    return this.run(['--list-skills'])
  }

  /** A skill's SKILL.md as written. */
  async read(name: string): Promise<string> {
    return readFile(join(await this.folder(), entry(name), 'SKILL.md'), 'utf8')
  }

  /** Creates the folder in the backend's home and gives the skills_dir
   * value that names it. */
  async defaultFolder(): Promise<string> {
    await mkdir(join(this.opts.home, defaultFolder), { recursive: true })
    return defaultFolder
  }

  /** A new skill folder holding only its SKILL.md. */
  create(skill: NewSkill): Promise<SkillChange> {
    const text = `---\n${stringify({ name: skill.name, description: skill.description }, { lineWidth: 0 })}---\n\n${skill.instructions.trim()}\n`
    return this.change(entry(skill.name), {
      async build(staged, target) {
        if (await exists(target)) return `${target} already exists`
        await mkdir(staged)
        await writeFile(join(staged, 'SKILL.md'), text)
      },
      commit: (staged, target) => rename(staged, target),
    })
  }

  /** Replaces a skill's SKILL.md; its other files stay. */
  save(name: string, text: string): Promise<SkillChange> {
    return this.change(entry(name), {
      async build(staged, target) {
        if (!(await exists(target))) return `${target} does not exist`
        await cp(target, staged, { recursive: true, verbatimSymlinks: true })
        await writeFile(join(staged, 'SKILL.md'), text)
      },
      commit: (staged, target) => rename(join(staged, 'SKILL.md'), join(target, 'SKILL.md')),
    })
  }

  /** Copies a skill folder in under its own name, which the agent requires
   * to be the skill's name. */
  import(source: string): Promise<SkillChange> {
    return this.change(entry(basename(source)), {
      async build(staged, target) {
        if (await exists(target)) return `${target} already exists`
        await cp(source, staged, { recursive: true, verbatimSymlinks: true })
      },
      commit: (staged, target) => rename(staged, target),
    })
  }

  /** Moves a skill's folder to the Trash. */
  async remove(name: string): Promise<void> {
    await this.opts.trash(join(await this.folder(), entry(name)))
    await this.opts.restart()
  }

  /** build stages the skill at staged, or says why it will not; commit
   * moves it to target once the agent's catalog accepts it. */
  private async change(
    name: string,
    step: { build(staged: string, target: string): Promise<string | void>; commit(staged: string, target: string): Promise<void> },
  ): Promise<SkillChange> {
    const dir = await this.folder()
    // Inside the folder, so the commit is a rename; the agent skips folders
    // whose names start with a dot.
    const root = await mkdtemp(join(dir, '.staging-'))
    const staged = join(root, name)
    const target = join(dir, name)
    try {
      const refused = await step.build(staged, target)
      if (refused) return { ok: false, error: refused }
      const checked = await this.run(['--check-skills', root])
      // The change is to the folder; staging is only how it is checked.
      if (!checked.ok) return { ok: false, error: checked.error.replaceAll(root, dir) }
      await step.commit(staged, target)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
    await this.opts.restart()
    return { ok: true }
  }

  private async folder(): Promise<string> {
    const list = await this.list()
    if (!list.dir) throw new Error(list.ok ? 'config.yaml sets no skills_dir' : list.error)
    return list.dir
  }

  private run(args: string[]): Promise<SkillList> {
    return new Promise((resolve) => {
      execFile(this.opts.binary, ['--home', this.opts.home, ...args], { timeout: 30_000 }, (err, stdout) => {
        try {
          const out = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as SkillsCheck
          resolve(out.ok ? { ok: true, dir: out.dir, skills: out.skills ?? [] } : { ok: false, dir: out.dir, error: out.error ?? '' })
        } catch {
          resolve({ ok: false, dir: '', error: err ? `cannot read the skills: ${err.message}` : 'cannot read the skills' })
        }
      })
    })
  }
}

/** A skill's folder name comes from the renderer: one entry of the folder,
 * not a path. */
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
