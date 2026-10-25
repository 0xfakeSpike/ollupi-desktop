// The three message directions of the gateway protocol, as type maps keyed by
// JSON-RPC method name. Clients derive typed call/notify/request signatures
// from these maps instead of hand-writing one function type per method.

import type {
  Decision,
  ItemRow,
  MemoryRow,
  MemoryStatus,
  ModelList,
  PermissionSettings,
  PreparedExecution,
  ThreadRow,
  ThreadStatus,
  ThreadSummary,
  ThreadView,
  TurnRow,
  UserInputAnswer,
  UserInputQuestion,
  WorkspaceRow,
} from './entities'

export interface TextInput {
  type: 'text'
  text: string
}

export interface ThreadPage extends ThreadView {
  hasMore: boolean
}

/** Requests the client sends; each entry is `{ params; result }`. */
export interface ClientMethods {
  initialize: {
    params: { clientInfo: { name: string; version: string } }
    result: { serverInfo: { name: string; version: string } }
  }
  'thread/start': {
    params: { workspaceId?: string } & Partial<PermissionSettings>
    result: { thread: ThreadRow }
  }
  'thread/resume': {
    params: { threadId: string; beforeSeq?: number; limit?: number }
    result: ThreadPage
  }
  'thread/read': {
    params: { threadId: string; beforeSeq?: number; limit?: number }
    result: ThreadPage
  }
  'thread/list': {
    /** workspaceId "" lists threads outside any workspace; omitted lists all. */
    params: { workspaceId?: string; limit?: number }
    result: { data: ThreadSummary[] }
  }
  'thread/updatePermissions': {
    params: { threadId: string } & PermissionSettings
    result: { thread: ThreadRow }
  }
  'turn/start': {
    params: { threadId: string; input: TextInput[]; connection?: string }
    result: { turn: TurnRow }
  }
  'turn/steer': {
    params: { threadId: string; input: TextInput[]; expectedTurnId: string }
    result: { turnId: string }
  }
  'turn/interrupt': {
    params: { threadId: string; turnId: string }
    result: Record<string, never>
  }
  'model/list': { params: Record<string, never>; result: ModelList }
  'workspace/list': { params: Record<string, never>; result: { data: WorkspaceRow[] } }
  'workspace/add': { params: { path: string; name?: string }; result: { workspace: WorkspaceRow } }
  'workspace/rename': {
    params: { workspaceId: string; name: string }
    result: { workspace: WorkspaceRow }
  }
  'workspace/archive': {
    params: { workspaceId: string; archived: boolean }
    result: { workspace: WorkspaceRow }
  }
  'workspace/updatePermissions': {
    params: { workspaceId: string } & PermissionSettings
    result: { workspace: WorkspaceRow }
  }
  'tool/call': {
    params: { threadId?: string; tool: string; arguments?: Record<string, unknown> }
    result: { output: unknown }
  }
  'memory/list': {
    params: { workspaceId?: string; includeGlobal?: boolean }
    result: { data: MemoryRow[] }
  }
  'memory/status': { params: Record<string, never>; result: MemoryStatus }
  'memory/update': { params: { id: string; text: string }; result: { memory: MemoryRow } }
  'memory/forget': { params: { id: string }; result: Record<string, never> }
}

export interface TurnNotification {
  threadId: string
  /** The thread as stored after this turn event (preview, updatedAt). */
  thread: ThreadRow
  turn: TurnRow
}

export interface ItemNotification {
  threadId: string
  turnId: string
  item: ItemRow
}

export interface DeltaNotification {
  threadId: string
  turnId: string
  itemId: string
  delta: string
}

/** Notifications the server pushes. */
export interface ServerNotifications {
  'thread/started': { thread: ThreadRow }
  'thread/status/changed': { threadId: string; status: ThreadStatus }
  'turn/queued': TurnNotification
  'turn/started': TurnNotification
  'turn/completed': TurnNotification
  'item/started': ItemNotification
  'item/completed': ItemNotification
  'item/agentMessage/delta': DeltaNotification
  'item/reasoning/textDelta': DeltaNotification
  'workspace/changed': { workspace: WorkspaceRow }
  error: { threadId?: string; turnId?: string; itemId?: string; message: string }
}

export interface ApprovalRequest {
  threadId: string
  turnId: string
  itemId: string
  approvalId: string
  server: string
  tool: string
  arguments: unknown
  preparedExecution?: PreparedExecution
  reason?: string
  availableDecisions: Decision[]
}

export interface UserInputRequest {
  threadId: string
  turnId: string
  itemId: string
  questions: UserInputQuestion[]
}

/** Requests the server sends and the client answers. */
export interface ServerRequests {
  'item/toolCall/requestApproval': { params: ApprovalRequest; result: { decision: Decision } }
  'item/tool/requestUserInput': {
    params: UserInputRequest
    result: { answers: Record<string, UserInputAnswer> }
  }
}

export type ClientMethod = keyof ClientMethods
export type ServerNotification = keyof ServerNotifications
export type ServerRequest = keyof ServerRequests
