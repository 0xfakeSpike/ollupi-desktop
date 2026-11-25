// The deployment's catalog of models, as its operator reads and sets it:
// ollupi keeps it in its store, the same for every profile. A connection of
// the operator (the app's own, to the backend this Mac runs, or a remote's
// operator token) reads it with the keys and sets it whole; ollupi checks it
// and tells every operator connection of the change (catalog/changed), and
// every connection of the models its profile now chooses among
// (model/changed, domains/models). A user's connection is refused, and the
// models screen then only chooses among the models.

import { errorMessage, RpcError, type OllupiClient } from '@ollupi/client'
import { ErrorCode, type CatalogChangedNotification } from '@ollupi/protocol'
import { create } from 'zustand'
import { gateway } from '../gateway/connection'
import type { Domain } from '../gateway/domain'
import { t } from '../i18n'
import { notify } from './notices'
import type { Provider } from './providers'

interface CatalogStore {
  /** Undefined until read, and for a connection that is not the operator's. */
  list: Provider[] | undefined
  /** Whether this connection may read and set the catalog; undefined until
   * it asked. */
  operator: boolean | undefined
}

export const useCatalog = create<CatalogStore>()(() => ({ list: undefined, operator: undefined }))

/** The commit the list holds: a change at or before it is in it already. */
let seen = 0

function changed({ data, seq }: CatalogChangedNotification): void {
  if (seq <= seen) return
  seen = seq
  useCatalog.setState({ list: data ?? [], operator: true })
}

async function read(client: OllupiClient): Promise<void> {
  try {
    const { result, newer } = await client.snapshot('catalog/read', {}, ['catalog/changed'])
    seen = result.seq
    useCatalog.setState({ list: result.data ?? [], operator: true })
    newer.forEach((e) => changed(e.params))
  } catch (err) {
    if (err instanceof RpcError && err.code === ErrorCode.forbidden) {
      useCatalog.setState({ list: undefined, operator: false })
      return
    }
    notify(t().errors.failed(t().errors.models.read, errorMessage(err)))
  }
}

export const catalogDomain: Domain = {
  bind: (client) => client.on('catalog/changed', changed),
  sync: (client) => read(client),
  disconnect: () => {
    seen = 0
    useCatalog.setState({ list: undefined, operator: undefined })
  },
}

/** Sets the catalog whole; false when ollupi refused it, which a notice
 * says, and the catalog stays as it was. New turns run on it at once, and a
 * turn already calling a model finishes on its client. */
export async function saveCatalog(next: Provider[]): Promise<boolean> {
  try {
    await gateway().call('catalog/set', { data: next })
    return true
  } catch (err) {
    notify(t().errors.failed(t().errors.models.save, errorMessage(err)))
    return false
  }
}
