// What every kind of tool call (core's ToolCall) has a view say of it.
// The registry (index.tsx) holds one per kind, so a new kind fails to
// compile until it has one.

import type { ToolCall } from '@ollupi/core'
import type { ApprovalRequestParams, ItemRow } from '@ollupi/protocol'
import type { ComponentType } from 'react'
import type { Messages } from '../../../i18n'

export interface ToolView<C extends ToolCall> {
  /** A one-line name for the call. */
  title(m: Messages, call: C): string
  /** How the call failed, in words, or undefined when it did not. */
  failure(m: Messages, call: C, item: ItemRow): string | undefined
  /** The call in the timeline. */
  Call: ComponentType<{ item: ItemRow; call: C }>
  /** What an approval card asks and shows of the call before it runs. */
  approval: {
    title(m: Messages, call: C, params: ApprovalRequestParams): string
    Body: ComponentType<{ call: C; params: ApprovalRequestParams }>
  }
}
