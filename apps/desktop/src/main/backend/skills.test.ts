import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackendSkills } from './skills'

// Against the real sidecar, which reads a SKILL.md as it reads the skills
// the desktop ships.
let bin: string
let dir: string
let skills: BackendSkills

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ollupid-test-'))
  bin = join(dir, 'ollupid')
  execFileSync('go', ['build', '-tags', 'sqlite_fts5', '-o', bin, './cmd/ollupid'], { cwd: join(import.meta.dirname, '../../../../../sidecar') })
  skills = new BackendSkills({ binary: bin, home: join(dir, 'home') })
}, 120_000)

afterAll(() => rm(dir, { recursive: true, force: true }))

async function folder(name: string, md: string, files: Record<string, string> = {}): Promise<string> {
  const at = join(dir, 'folders', name)
  await mkdir(join(at, 'scripts'), { recursive: true })
  await writeFile(join(at, 'SKILL.md'), md)
  for (const [path, body] of Object.entries(files)) await writeFile(join(at, path), body)
  return at
}

describe('BackendSkills.read', () => {
  it('reads a folder as the fields skill/set takes, leaving out what is not text', async () => {
    const at = await folder('hello', '---\nname: hello\ndescription: Says hello.\nmetadata:\n  version: 1.2\n---\n\nSay hello.\n', {
      'scripts/run.py': 'print("hello")\n',
      'logo.png': '\u0000PNG',
    })
    expect(await skills.read(at)).toEqual({
      ok: true,
      skill: { name: 'hello', description: 'Says hello.', version: '1.2', instructions: 'Say hello.', files: [{ path: 'scripts/run.py', text: 'print("hello")\n' }] },
      skipped: ['logo.png'],
    })
  })

  it('says why a folder is not a skill', async () => {
    const named = await folder('other', '---\nname: hello\ndescription: x\n---\n\nDo it.\n')
    expect(await skills.read(named)).toMatchObject({ ok: false, error: expect.stringContaining('"other"') })
    const plain = await folder('plain', 'No frontmatter.\n')
    expect(await skills.read(plain)).toMatchObject({ ok: false, error: expect.stringContaining('frontmatter') })
  })
})
