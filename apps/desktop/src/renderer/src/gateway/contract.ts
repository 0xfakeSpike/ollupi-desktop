// Dev builds only: checks every gateway message, both directions, against
// the contract the UI was generated from. A mismatch means the types the UI
// relies on are wrong for this backend, or the UI sent something the
// gateway does not accept; it is reported once per method and part.
// Loaded with a dynamic import, so production bundles carry none of it.

import type { Inspector } from '@ollupi/client'
import contract from '@ollupi/protocol/protocol.schema.json'
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { notify } from '../domains/notices'

type Section = 'methods' | 'notifications' | 'serverRequests' | 'clientNotifications'
type Ref = { $ref: string }

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
ajv.addSchema({ $id: 'ollupi-protocol', $schema: contract.$schema, $defs: contract.$defs })

const compiled = new Map<string, ValidateFunction>()
const reported = new Set<string>()

/** The contract's schema for one part of a message, if it declares one. */
function schemaFor(section: Section, method: string, part?: 'params' | 'result'): Ref | undefined {
  const entry = (contract[section] as Record<string, unknown>)[method]
  if (!entry) return undefined
  return (part ? (entry as Record<string, Ref>)[part] : entry) as Ref
}

function check(where: string, schema: Ref | undefined, payload: unknown): void {
  if (!schema) return report(where, 'is not in the contract')
  const id = `ollupi-protocol${schema.$ref}`
  let validate = compiled.get(id)
  if (!validate) {
    validate = ajv.getSchema(id)
    if (!validate) return report(where, `refers to ${schema.$ref}, which the contract does not define`)
    compiled.set(id, validate)
  }
  if (!validate(payload)) report(where, ajv.errorsText(validate.errors), payload)
}

function report(where: string, problem: string, payload?: unknown): void {
  const key = `${where}: ${problem}`
  if (reported.has(key)) return
  reported.add(key)
  console.warn(`[contract] ${key}`, payload)
  notify(`Contract mismatch: ${where} ${problem}`)
}

export function contractInspector(): Inspector {
  return {
    sent(kind, method, payload) {
      if (kind === 'params') check(`${method} params`, schemaFor('methods', method, 'params'), payload)
      else if (kind === 'notification') check(`${method} notification`, schemaFor('clientNotifications', method), payload)
      else check(`${method} response`, schemaFor('serverRequests', method, 'result'), payload)
    },
    received(kind, method, payload) {
      if (kind === 'result') check(`${method} result`, schemaFor('methods', method, 'result'), payload)
      else if (kind === 'notification') check(`${method} notification`, schemaFor('notifications', method), payload)
      else check(`${method} request`, schemaFor('serverRequests', method, 'params'), payload)
    },
  }
}
