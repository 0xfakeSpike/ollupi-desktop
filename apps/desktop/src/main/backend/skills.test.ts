import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BackendSkills } from './skills'

// Against the real sidecar, so the agent's own catalog judges each change.
let bin: string
let home: string
let restarts: number
let skills: BackendSkills

const config = (skillsDir: string) => `name: test\nmodels: [{provider: p, type: openai, names: [{name: m, limits: {context: 1000, output: 100}}]}]\nskills_dir: ${skillsDir}\n`
const skillFile = (name: string, body = 'Do it.') => `---\nname: ${name}\ndescription: Says hello.\n---\n\n${body}\n`

beforeAll(async () => {
  bin = join(await mkdtemp(join(tmpdir(), 'ollupid-test-')), 'ollupid')
  execFileSync('go', ['build', '-o', bin, './cmd/ollupid'], { cwd: join(import.meta.dirname, '../../../../../sidecar') })
}, 120_000)

afterAll(() => rm(join(bin, '..'), { recursive: true, force: true }))

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'ollupi-home-'))
  await mkdir(join(home, 'skills'))
  await writeFile(join(home, 'config.yaml'), config('skills'))
  restarts = 0
  skills = new BackendSkills({
    binary: bin,
    home,
    restart: async () => void restarts++,
    trash: (path) => rm(path, { recursive: true }),
  })
  return () => rm(home, { recursive: true, force: true })
})

describe('BackendSkills', () => {
  it('lists the folder skills_dir names, resolved against home', async () => {
    expect(await skills.list()).toEqual({ ok: true, dir: join(home, 'skills'), skills: [] })
  })

  it('creates a skill the agent loads, and restarts', async () => {
    const result = await skills.create({ name: 'say-hello', description: 'Says hello: when greeted.', instructions: 'Say hello.' })
    expect(result).toEqual({ ok: true })
    expect(restarts).toBe(1)
    const list = await skills.list()
    expect(list.ok && list.skills.map((s) => [s.name, s.description])).toEqual([['say-hello', 'Says hello: when greeted.']])
    expect(await skills.read('say-hello')).toContain('Say hello.')
  })

  it('refuses a skill the agent would not load, leaving the folder as it was', async () => {
    const result = await skills.create({ name: 'Bad_Name', description: 'x', instructions: 'y' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('invalid name')
    expect(!result.ok && result.error).not.toContain('.staging-')
    expect(restarts).toBe(0)
    expect(await readdir(join(home, 'skills'))).toEqual([])
  })

  it('saves SKILL.md and keeps the files beside it', async () => {
    await mkdir(join(home, 'skills', 'say-hello', 'references'), { recursive: true })
    await writeFile(join(home, 'skills', 'say-hello', 'SKILL.md'), skillFile('say-hello'))
    await writeFile(join(home, 'skills', 'say-hello', 'references', 'a.md'), 'detail')

    expect(await skills.save('say-hello', skillFile('say-hello', 'Do it twice.'))).toEqual({ ok: true })
    expect(await readFile(join(home, 'skills', 'say-hello', 'SKILL.md'), 'utf8')).toContain('Do it twice.')
    expect(existsSync(join(home, 'skills', 'say-hello', 'references', 'a.md'))).toBe(true)

    // A name the folder does not have is the agent's error, about the real folder.
    const renamed = await skills.save('say-hello', skillFile('other'))
    expect(!renamed.ok && renamed.error).toContain(`directory "say-hello" must match frontmatter name "other"`)
    expect(await readFile(join(home, 'skills', 'say-hello', 'SKILL.md'), 'utf8')).toContain('Do it twice.')
  })

  it('imports a folder under its own name', async () => {
    const source = join(await mkdtemp(join(tmpdir(), 'skill-src-')), 'say-hello')
    await mkdir(source)
    await writeFile(join(source, 'SKILL.md'), skillFile('say-hello'))
    expect(await skills.import(source)).toEqual({ ok: true })
    expect(await skills.import(source)).toEqual({ ok: false, error: `${join(home, 'skills', 'say-hello')} already exists` })
    const list = await skills.list()
    expect(list.ok && list.skills.map((s) => s.name)).toEqual(['say-hello'])
    await rm(join(source, '..'), { recursive: true })
  })

  it('removes a skill folder', async () => {
    await mkdir(join(home, 'skills', 'say-hello'))
    await writeFile(join(home, 'skills', 'say-hello', 'SKILL.md'), skillFile('say-hello'))
    await skills.remove('say-hello')
    expect(await readdir(join(home, 'skills'))).toEqual([])
    await expect(skills.remove('../config.yaml')).rejects.toThrow('not a skill folder name')
  })

  it('reports a folder the agent would refuse', async () => {
    await mkdir(join(home, 'skills', 'bad'))
    await writeFile(join(home, 'skills', 'bad', 'SKILL.md'), skillFile('other'))
    const list = await skills.list()
    expect(list).toEqual({ ok: false, dir: join(home, 'skills'), error: 'skills: directory "bad" must match frontmatter name "other"' })
  })
})
