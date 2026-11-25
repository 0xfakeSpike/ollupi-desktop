// The backend's home, as the main process tends to it outside the running
// backend: what an older home kept in files (config.yaml, profiles.json) is
// taken into the store once before the backend starts (ollupid
// --import-config), and a profile's data is deleted while the backend is
// stopped (ollupid --delete-profile). The backend reads no config file.

import { execFile } from 'node:child_process'

export interface HomeOptions {
  binary: string
  home: string
  env(): Promise<NodeJS.ProcessEnv>
  /** The profiles.json 0.8.17-beta.3 kept in the app's own folder, for the
   * names and colours of the profiles an older config.yaml declared. */
  olderProfiles: string
  backend: {
    start(): Promise<void>
    stop(): Promise<void>
  }
}

export class BackendHome {
  private importing: Promise<void> | undefined

  constructor(private readonly opts: HomeOptions) {}

  /** Deletes a profile's data from the store while the backend is stopped,
   * so nothing else writes the database; resolves to the threads whose
   * attachment folders go with it. The backend refuses while one of the
   * profile's turns is in progress or queued. */
  async deleteProfile(id: string): Promise<string[]> {
    const env = await this.opts.env()
    await this.opts.backend.stop()
    try {
      const result = await this.run('the profile could not be deleted', ['--home', this.opts.home, '--delete-profile', id], env)
      return (result.threads as string[] | undefined) ?? []
    } finally {
      await this.opts.backend.start()
    }
  }

  /** Moves what an older home kept in files (models, profiles, skills) into the
   * store, before anything reads the file; once per start, and a no-op once
   * done. */
  importOlder(): Promise<void> {
    this.importing ??= this.opts.env()
      .then((env) => this.run('the older config could not be imported', ['--home', this.opts.home, '--import-config', '--names', this.opts.olderProfiles], env))
      .then(() => undefined)
      .catch((err: unknown) => {
        this.importing = undefined
        throw err
      })
    return this.importing
  }

  /** Runs one of ollupid's modes, which answer with a JSON line. */
  private run(failed: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ ok?: boolean; error?: string; [key: string]: unknown }> {
    return new Promise((resolve, reject) => {
      execFile(this.opts.binary, args, { env, timeout: 30_000 }, (err, stdout) => {
        let result: { ok?: boolean; error?: string }
        try {
          result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as { ok?: boolean; error?: string }
        } catch {
          return reject(new Error(err ? `${failed}: ${err.message}` : failed))
        }
        if (err || !result.ok) reject(new Error(result.error ?? err?.message ?? failed))
        else resolve(result)
      })
    })
  }
}
