// The JSON files the browser keeps in the app's data folder.

import { readFile, rename, writeFile } from 'node:fs/promises'

/** The file's value; undefined only when it is not there yet. One that is
 * there but cannot be read throws: taken as empty, the next save would
 * replace what it holds. */
export async function readKept(file: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`${file} does not hold JSON`, { cause: err })
  }
}

/** Through a file beside it, so a crash mid-write leaves the old one whole. */
export async function writeKept(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`
  await writeFile(tmp, text)
  await rename(tmp, file)
}
