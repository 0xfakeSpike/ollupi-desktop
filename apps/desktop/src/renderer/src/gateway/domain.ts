// A Domain is one area of server state the renderer mirrors (threads,
// timelines, requests...). It owns its store and declares how it follows a
// connection; the session only runs these hooks.

import type { OllupiClient } from '@ollupi/client'

export interface Domain {
  /** Subscribes to the gateway events this domain mirrors; returns the
   * unsubscribe. Runs before sync, so nothing between is missed. */
  bind?(client: OllupiClient): () => void
  /** Loads this domain's state on a fresh connection. */
  sync?(client: OllupiClient): Promise<void>
  /** Drops state that only holds for the connection that just ended. */
  disconnect?(): void
}
