// A skill folder on this Mac, read for the app to import. Each profile keeps
// its skills in ollupi's store, which the renderer reads and changes over
// the gateway; a folder in the Agent Skills format (a SKILL.md and the
// files beside it) is only how one is brought in. The sidecar reads it
// (ollupid --read-skill), as it reads the skills the desktop ships, so the
// app and the backend take a SKILL.md the same way.

import { execFile } from 'node:child_process'
import type { SkillFolder } from '../../shared/generated/backend-skills'

export interface SkillsOptions {
  binary: string
  home: string
}

export class BackendSkills {
  constructor(private readonly opts: SkillsOptions) {}

  /** The skill in dir as fields for skill/set, without the agents that
   * have it, or why it cannot be read. */
  read(dir: string): Promise<SkillFolder> {
    return new Promise((resolve) => {
      execFile(this.opts.binary, ['--home', this.opts.home, '--read-skill', dir], { timeout: 30_000, maxBuffer: 16 << 20 }, (err, stdout) => {
        try {
          resolve(JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as SkillFolder)
        } catch {
          resolve({ ok: false, error: err ? `cannot read the skill: ${err.message}` : 'cannot read the skill' })
        }
      })
    })
  }
}
