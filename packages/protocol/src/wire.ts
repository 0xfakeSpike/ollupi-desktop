// Which params and result each gateway method takes. The shapes come from
// generated.ts; only the pairing is written here, because the gateway pairs
// them in its handlers (gateway/server.go and the per-area files), not in
// declarations a generator can read. Handlers that decode into an inline
// struct are spelled out with a pointer to it.
//
// The checks at the bottom fail the build when these maps and the gateway's
// method names (generated from its constants) differ, so a method added or
// removed in ollupi cannot go unnoticed.

import type {
  ApprovalRequestParams,
  ApprovalResponse,
  ClientMethodName,
  ClientNotificationName,
  CronJobParams,
  CronJobRow,
  DeltaNotification,
  ErrorNotification,
  InitializeParams,
  InitializeResult,
  ItemNotification,
  MemoryRow,
  MemoryStatus,
  ModelListResult,
  PermissionSettings,
  ServerNotificationName,
  ServerRequestName,
  ThreadFilter,
  ThreadListResult,
  ThreadPageParams,
  ThreadPageResult,
  ThreadResult,
  ThreadStartParams,
  ThreadStatusNotification,
  ToolListResult,
  TurnInterruptParams,
  TurnNotification,
  TurnResult,
  TurnSteerParams,
  TurnSteerResult,
  TurnStartParams,
  UserInputRequestParams,
  UserInputResponse,
  WorkspaceRow,
} from './generated'

/** Methods that take no params decode an empty object. */
type None = Record<string, never>

interface WorkspaceResult {
  workspace: WorkspaceRow
}

/** Requests the client sends: `{ params; result }` per method. */
export interface ClientMethods {
  initialize: { params: InitializeParams; result: InitializeResult }
  'model/list': { params: None; result: ModelListResult }
  'tool/list': { params: None; result: ToolListResult }

  'thread/start': { params: ThreadStartParams; result: ThreadResult }
  'thread/list': { params: ThreadFilter; result: ThreadListResult }
  /** Like thread/read, and re-sends the thread's pending requests. */
  'thread/resume': { params: ThreadPageParams; result: ThreadPageResult }
  'thread/read': { params: ThreadPageParams; result: ThreadPageResult }
  // server.go: struct { ThreadID; repo.PermissionSettings }
  'thread/updatePermissions': { params: { threadId: string } & PermissionSettings; result: ThreadResult }

  'turn/start': { params: TurnStartParams; result: TurnResult }
  'turn/steer': { params: TurnSteerParams; result: TurnSteerResult }
  'turn/interrupt': { params: TurnInterruptParams; result: None }

  // workspaces.go
  'workspace/list': { params: None; result: { data: WorkspaceRow[] } }
  'workspace/add': { params: { path: string; name?: string }; result: WorkspaceResult }
  'workspace/rename': { params: { workspaceId: string; name: string }; result: WorkspaceResult }
  'workspace/archive': { params: { workspaceId: string; archived: boolean }; result: WorkspaceResult }
  'workspace/updatePermissions': { params: { workspaceId: string } & PermissionSettings; result: WorkspaceResult }

  // cron.go: every method decodes cronJobParams and needs threadId; all but
  // list need name; create needs spec and prompt; pause needs paused.
  'cron/list': { params: Pick<CronJobParams, 'threadId'>; result: { data: CronJobRow[] } }
  'cron/create': { params: Required<Omit<CronJobParams, 'paused'>>; result: CronJobRow }
  'cron/pause': { params: Required<Pick<CronJobParams, 'threadId' | 'name' | 'paused'>>; result: CronJobRow }
  'cron/delete': { params: Required<Pick<CronJobParams, 'threadId' | 'name'>>; result: None }

  // memory.go
  'memory/list': { params: { workspaceId?: string; includeGlobal?: boolean }; result: { data: MemoryRow[] } }
  'memory/status': { params: None; result: MemoryStatus }
  'memory/update': { params: { id: string; text: string }; result: { memory: MemoryRow } }
  'memory/forget': { params: { id: string }; result: None }
}

/** Notifications the client sends. */
export interface ClientNotifications {
  initialized: None
}

/** Notifications the server pushes. */
export interface ServerNotifications {
  'thread/started': ThreadResult
  'thread/status/changed': ThreadStatusNotification
  'turn/queued': TurnNotification
  'turn/started': TurnNotification
  'turn/completed': TurnNotification
  'item/started': ItemNotification
  'item/completed': ItemNotification
  'item/agentMessage/delta': DeltaNotification
  'item/reasoning/textDelta': DeltaNotification
  // workspaces.go sends the workspaceRequest result.
  'workspace/changed': WorkspaceResult
  error: ErrorNotification
}

/** Requests the server sends and the client answers. */
export interface ServerRequests {
  'item/toolCall/requestApproval': { params: ApprovalRequestParams; result: ApprovalResponse }
  'item/tool/requestUserInput': { params: UserInputRequestParams; result: UserInputResponse }
}

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Check<T extends true> = T

// Each line fails to compile when its map and the gateway disagree.
export type _ClientMethodsMatch = Check<Same<keyof ClientMethods, ClientMethodName>>
export type _ClientNotificationsMatch = Check<Same<keyof ClientNotifications, ClientNotificationName>>
export type _ServerNotificationsMatch = Check<Same<keyof ServerNotifications, ServerNotificationName>>
export type _ServerRequestsMatch = Check<Same<keyof ServerRequests, ServerRequestName>>
