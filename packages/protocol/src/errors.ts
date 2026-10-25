// JSON-RPC error codes: the standard range plus the gateway's own.
export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerError: -32000,
  NotInitialized: -32002,
  NotFound: -32004,
  NoActiveTurn: -32010,
  TurnMismatch: -32011,
  NoSuchRequest: -32012,
  SubagentThread: -32013,
  WorkspaceArchived: -32014,
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
