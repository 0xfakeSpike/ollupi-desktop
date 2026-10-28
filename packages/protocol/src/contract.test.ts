// The recorded session (fixtures/session.json, real traffic from the
// current sidecar) checked against the contract the types come from: every
// message in both directions must validate, so the generated types describe
// what the gateway actually sends and accepts.

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import contract from './generated/protocol.schema.json'
import { ErrorCode, isToolPart, PROTOCOL_SHA256 } from './index'

interface Recorded {
  direction: 'in' | 'out'
  message: { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code: number } }
}

const fixture = JSON.parse(readFileSync(new URL('../fixtures/session.json', import.meta.url), 'utf8')) as {
  recordedWith: { protocolSha256: string }
  messages: Recorded[]
}

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
ajv.addSchema({ $id: 'ollupi-protocol', $schema: contract.$schema, $defs: contract.$defs })

type Ref = { $ref: string }
const sections = contract as unknown as Record<string, Record<string, Ref & { params: Ref; result: Ref }>>

function check(label: string, schema: Ref | undefined, payload: unknown): string | undefined {
  if (!schema) return `${label}: not in the contract`
  const validate = ajv.getSchema(`ollupi-protocol${schema.$ref}`)
  if (!validate) return `${label}: ${schema.$ref} is not defined`
  return validate(payload) ? undefined : `${label}: ${ajv.errorsText(validate.errors)}`
}

describe('recorded session', () => {
  it('was recorded with the contract the types come from', () => {
    // Re-record with `node scripts/record-session.mjs` when this fails.
    expect(fixture.recordedWith.protocolSha256).toBe(PROTOCOL_SHA256)
  })

  it('matches the contract in both directions', () => {
    const clientCalls = new Map<number | string, string>()
    const serverCalls = new Map<number | string, string>()
    const problems: string[] = []
    let checked = 0
    for (const { direction, message: m } of fixture.messages) {
      let problem: string | undefined
      if (direction === 'out' && m.method && m.id !== undefined) {
        clientCalls.set(m.id, m.method)
        problem = check(`${m.method} params`, sections.methods![m.method]?.params, m.params)
      } else if (direction === 'out' && m.method) {
        problem = check(`${m.method} notification`, sections.clientNotifications![m.method], m.params)
      } else if (direction === 'out') {
        const method = serverCalls.get(m.id!)!
        problem = check(`${method} response`, sections.serverRequests![method]?.result, m.result)
      } else if (m.method && m.id !== undefined) {
        serverCalls.set(m.id, m.method)
        problem = check(`${m.method} request`, sections.serverRequests![m.method]?.params, m.params)
      } else if (m.method) {
        problem = check(`${m.method} notification`, sections.notifications![m.method], m.params)
      } else if (m.error) {
        problem = Object.values(ErrorCode).includes(m.error.code as ErrorCode) ? undefined : `error code ${m.error.code} is not in the contract`
      } else {
        const method = clientCalls.get(m.id!)!
        problem = check(`${method} result`, sections.methods![method]?.result, m.result)
      }
      checked++
      if (problem) problems.push(problem)
    }
    expect(problems).toEqual([])
    expect(checked).toBe(fixture.messages.length)
  })
})

describe('tool validators', () => {
  // The renderer loads tools.validate.js as a module, where require does not
  // exist: one left in stops the app from starting.
  it('need nothing a module cannot load', () => {
    expect(readFileSync(new URL('./generated/tools.validate.js', import.meta.url), 'utf8')).not.toMatch(/require\(/)
  })

  it('count a string by its characters, as the contract does', () => {
    const task = (description: string) => isToolPart('Agent', 'arguments', { description, prompt: 'p' })
    expect(task('🙂'.repeat(80))).toBe(true)
    expect(task('a'.repeat(81))).toBe(false)
    expect(task('')).toBe(false)
  })
})
