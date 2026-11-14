import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BackendSkills } from './skills'

// Against the real sidecar, so the agent's own rules judge each change.
let bin: string
let home: string
let skills: BackendSkills

const config = (skillsDir: string) => `name: test\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\nskills_dir: ${skillsDir}\n`
const skillFile = (name: string, body = 'Do it.') => `---\nname: ${name}\ndescription: Says hello.\n---\n\n${body}\n`
const main = ['full-main-agent', 'compact-main-agent']

async function install(role: string, name: string, text = skillFile(name)) {
  await mkdir(join(home, 'skills', role, name), { recursive: true })
  await writeFile(join(home, 'skills', role, name, 'SKILL.md'), text)
}

beforeAll(async () => {
  bin = join(await mkdtemp(join(tmpdir(), 'ollupid-test-')), 'ollupid')
  execFileSync('go', ['build', '-tags', 'sqlite_fts5', '-o', bin, './cmd/ollupid'], { cwd: join(import.meta.dirname, '../../../../../sidecar') })
}, 120_000)

afterAll(() => rm(join(bin, '..'), { recursive: true, force: true }))

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ollupi-home-'))
  await mkdir(join(home, 'skills'))
  await writeFile(join(home, 'config.yaml'), config('skills'))
  skills = new BackendSkills({ binary: bin, home, trash: (path) => rm(path, { recursive: true }) })
  return () => rm(home, { recursive: true, force: true })
})

/** The names of each agent's skills, in the order the app shows them. */
const names = (list: Awaited<ReturnType<BackendSkills['list']>>) => (list.ok ? Object.fromEntries(list.agents.map((a) => [a.agent, a.skills.map((s) => s.name)])) : list.error)

describe('BackendSkills', () => {
  it('lists each agent’s skills in the folder skills_dir names, resolved against home', async () => {
    expect(await skills.list()).toEqual({
      ok: true,
      dir: join(home, 'skills'),
      agents: [
        { agent: 'main', skills: [] },
        { agent: 'general-sub-agent', skills: [] },
        { agent: 'browser-sub-agent', skills: [] },
      ],
    })
  })

  it('creates the main agent’s skill in both of its roles', async () => {
    const result = await skills.create('main', { name: 'say-hello', description: 'Says hello: when greeted.', instructions: 'Say hello.' })
    expect(result).toEqual({ ok: true })
    expect((await readdir(join(home, 'skills'))).sort()).toEqual([...main].sort())
    expect(names(await skills.list())).toEqual({ main: ['say-hello'], 'general-sub-agent': [], 'browser-sub-agent': [] })
    expect(await skills.read('main', 'say-hello')).toContain('Say hello.')
  })

  it('refuses a skill the agent would not load, leaving the folder as it was', async () => {
    const result = await skills.create('main', { name: 'Bad_Name', description: 'x', instructions: 'y' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('invalid name')
    expect(!result.ok && result.error).not.toContain('.staging-')
    expect(await readdir(join(home, 'skills'))).toEqual([])
  })

  it('saves the agent’s SKILL.md, keeping the files beside it and other agents’ copies', async () => {
    for (const role of main) await install(role, 'say-hello')
    await install('general-sub-agent', 'say-hello')
    await mkdir(join(home, 'skills', 'full-main-agent', 'say-hello', 'references'))
    await writeFile(join(home, 'skills', 'full-main-agent', 'say-hello', 'references', 'a.md'), 'detail')

    expect(await skills.save('main', 'say-hello', skillFile('say-hello', 'Do it twice.'))).toEqual({ ok: true })
    for (const role of main) expect(await readFile(join(home, 'skills', role, 'say-hello', 'SKILL.md'), 'utf8')).toContain('Do it twice.')
    expect(await readFile(join(home, 'skills', 'general-sub-agent', 'say-hello', 'SKILL.md'), 'utf8')).not.toContain('Do it twice.')
    expect(existsSync(join(home, 'skills', 'full-main-agent', 'say-hello', 'references', 'a.md'))).toBe(true)

    // A name the folder does not have is the agent's error, about the real folder.
    const renamed = await skills.save('main', 'say-hello', skillFile('other'))
    expect(!renamed.ok && renamed.error).toContain(`directory "say-hello" must match frontmatter name "other"`)
    expect(await readFile(join(home, 'skills', 'full-main-agent', 'say-hello', 'SKILL.md'), 'utf8')).toContain('Do it twice.')
  })

  it('imports a folder for an agent under its own name', async () => {
    const source = join(await mkdtemp(join(tmpdir(), 'skill-src-')), 'say-hello')
    await mkdir(source)
    await writeFile(join(source, 'SKILL.md'), skillFile('say-hello'))
    expect(await skills.import('general-sub-agent', source)).toEqual({ ok: true })
    expect(await skills.import('general-sub-agent', source)).toEqual({ ok: false, error: `${join(home, 'skills', 'general-sub-agent', 'say-hello')} already exists` })
    expect(names(await skills.list())).toEqual({ main: [], 'general-sub-agent': ['say-hello'], 'browser-sub-agent': [] })
    await rm(join(source, '..'), { recursive: true })
  })

  it('gives another agent a copy of its own', async () => {
    for (const role of main) await install(role, 'say-hello')
    expect(await skills.copy('main', 'say-hello', 'browser-sub-agent')).toEqual({ ok: true })
    expect(names(await skills.list())).toEqual({ main: ['say-hello'], 'general-sub-agent': [], 'browser-sub-agent': ['say-hello'] })
  })

  it('removes one agent’s copy of a skill', async () => {
    for (const role of main) await install(role, 'say-hello')
    await install('general-sub-agent', 'say-hello')
    await skills.remove('main', 'say-hello')
    for (const role of main) expect(await readdir(join(home, 'skills', role))).toEqual([])
    expect(names(await skills.list())).toEqual({ main: [], 'general-sub-agent': ['say-hello'], 'browser-sub-agent': [] })
    await expect(skills.remove('main', '../config.yaml')).rejects.toThrow('not a skill folder name')
  })

  it('reports a folder the agent would refuse', async () => {
    await install('full-main-agent', 'bad', skillFile('other'))
    const list = await skills.list()
    expect(list).toEqual({ ok: false, dir: join(home, 'skills'), error: 'skills: directory "bad" must match frontmatter name "other"' })
  })
})
