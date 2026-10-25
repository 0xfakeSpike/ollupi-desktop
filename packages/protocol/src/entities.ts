// Records the gateway sends, mirroring the JSON shape of ollupi's repo, tools
// and llm types. Timestamps are RFC 3339 strings.

export type ApprovalPolicy = 'untrusted' | 'on-request' | 'never'

export interface PermissionRules {
  allow?: string[]
  ask?: string[]
  deny?: string[]
}

export interface PermissionSettings {
  approvalPolicy?: ApprovalPolicy | ''
  permissions: PermissionRules
}

export interface Model {
  name: string
  /** The model's unique key; turn/start selects a model by it. */
  connection: string
  thinking?: boolean
}

export interface ModelList {
  data: Model[]
  /** Connection of the default model. */
  default: string
}

export interface WorkspaceRow {
  id: string
  name: string
  rootPath: string
  settings: PermissionSettings
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export type ThreadStatus = 'idle' | 'active' | 'waitingOnApproval' | 'waitingOnUserInput'

export interface ThreadRow {
  id: string
  workspaceId?: string
  preview: string
  settings: PermissionSettings
  parentThreadId?: string
  parentItemId?: string
  createdAt: string
  updatedAt: string
}

export interface ThreadSummary extends ThreadRow {
  status: ThreadStatus
}

export type TurnStatus = 'queued' | 'inProgress' | 'completed' | 'failed' | 'interrupted'

export interface Usage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export interface TurnRow {
  id: string
  threadId: string
  seq: number
  status: TurnStatus
  model: Model
  usage: Usage
  error?: string
  input?: string
  cronJobId?: string
  startedAt: string
  completedAt?: string
}

export type ItemType =
  | 'userMessage'
  | 'agentMessage'
  | 'reasoning'
  | 'toolCall'
  | 'contextCompaction'
  | 'memoryContext'
  | 'toolProgress'
  | 'error'

export type ItemStatus = 'inProgress' | 'completed' | 'failed' | 'declined'

export type Decision = 'accept' | 'acceptForSession' | 'decline'

export interface ContextStats {
  model?: string
  budgetTokens: number
  systemTokens: number
  messagesTokens: number
  memoryTokens?: number
  toolsTokens: number
  estimatedTokens: number
  calibratedTokens?: number
}

export interface MemoryReference {
  id: string
  workspaceId?: string
  topic?: string
  text: string
}

export interface Approval {
  id: string
  requestedAt: string
  reason?: string
  rule?: string
  content?: string
  decision?: Decision
  decidedBy?: string
  decidedAt?: string
  error?: string
}

export interface Annotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

/** The frozen command an approval applies to. */
export interface PreparedExecution {
  cwd: string
  settingsDigest: string
  argumentsDigest: string
  program?: string
  args?: string[]
  env?: Record<string, string>
  timeoutSec?: number
  sandboxed?: boolean
  escalated?: boolean
  justification?: string
}

export interface Await {
  by: 'user' | 'agent' | string
  request: unknown
  threadId?: string
}

export interface ContextArtifact {
  kind: string
  name: string
  content: string
  source?: string
  digest?: string
}

export interface ToolResult {
  output?: unknown
  artifacts?: ContextArtifact[]
}

export interface ItemRow {
  id: string
  turnId: string
  seq: number
  type: ItemType
  status: ItemStatus
  text?: string
  responseId?: string
  contextStats?: ContextStats
  usage?: Usage
  memory?: MemoryReference[]
  callId?: string
  tool?: string
  /** JSON-encoded tool arguments. */
  arguments?: string
  server?: string
  annotations?: Annotations
  approval?: Approval
  preparedExecution?: PreparedExecution
  await?: Await
  result?: ToolResult
  error?: string
  startedAt: string
  completedAt?: string
}

export interface ThreadView {
  thread: ThreadRow
  turns: TurnRow[]
  items: ItemRow[]
}

export interface MemorySource {
  table: string
  id: string
  operation?: string
  occurredAt?: string
}

export type MemoryEntryStatus = 'active' | 'retired' | 'forgotten'

export interface MemoryRow {
  id: string
  workspaceId?: string
  topic: string
  kind: string
  text: string
  status: MemoryEntryStatus
  userEdited?: boolean
  sources: MemorySource[]
  createdAt: string
  updatedAt: string
}

export interface MemoryStatus {
  generationEnabled: boolean
  useEnabled: boolean
  pending: number
  failed: number
  active: number
  attempts?: number
  nextAttempt?: string
  lastSuccess?: string
  lastError?: string
}

export interface UserInputOption {
  label: string
  description?: string
}

export interface UserInputQuestion {
  id: string
  header: string
  question: string
  options?: UserInputOption[]
}

export interface UserInputAnswer {
  answers: string[]
}
