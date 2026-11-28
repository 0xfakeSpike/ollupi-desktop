// The app's own SQLite: what the main process needs to read before any
// backend exists — the servers the window may connect to, and the sandbox
// bridge it gives the backend it runs. One row per setting, kept in
// plain text: the app no longer asks this Mac's keychain for anything.

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'

export class Db {
  private readonly db: DatabaseSync

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true })
    this.db = open(file)
    this.db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  }

  get(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  }

  set(key: string, value: string): void {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }
}

/** Opens the file, setting a broken one aside rather than keeping the app
 * from starting. */
function open(file: string): DatabaseSync {
  try {
    return new DatabaseSync(file)
  } catch (err) {
    console.error('the settings database is set aside', err)
    renameSync(file, `${file}.broken`)
    return new DatabaseSync(file)
  }
}
