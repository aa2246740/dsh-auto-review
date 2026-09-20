/** JSON-only public contracts shared by the approval Host and its settings UI. */
export const APPROVAL_API_PATH = '/api/approve-for-me'
export const CREATOR_CONSENT_API_PATH = '/api/approve-for-me/creator'
export type ReviewStage = 'pre-execute' | 'approval-request'
export type ReviewStatus = 'reviewing' | 'pending-human' | 'allowed' | 'denied' | 'failed' | 'cancelled' | 'unavailable' | 'interrupted'
export type DecisionSource = 'model' | 'deterministic' | 'rule' | 'human' | 'failure'
export type ExecutionStatus = 'not-started' | 'unknown' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'

/** A redacted audit row; argumentFingerprint binds exact original JSON without storing it. */
export interface ReviewRecord {
  id: string
  createdAt: number
  updatedAt: number
  sessionId: string
  callId?: string
  rootCallId?: string
  stage: ReviewStage
  toolName: string
  pluginId?: string
  argumentFingerprint?: string
  argumentsSummary: string
  permissionSummary: string
  status: ReviewStatus
  source: DecisionSource
  reason: string
  failureKind?: string
  riskLevel?: string
  model?: string
  elapsedMs?: number
  ruleId?: string
  execution: ExecutionStatus
}

/** User-owned, bounded approval rule. An allow still requires a verified runtime capability. */
export interface ApprovalRule {
  id: string
  version: number
  name: string
  enabled: boolean
  action: 'allow' | 'ask' | 'deny'
  scope: 'exact-arguments' | 'creator-plugin'
  sessionId: string
  stage: ReviewStage
  toolName: string
  argumentFingerprint?: string
  pluginId?: string
  createdAt: number
  expiresAt: number
}

export interface RuleContext {
  sessionId: string
  stage: ReviewStage
  toolName: string
  argumentFingerprint?: string
  pluginId?: string
  sourceVerified: boolean
  permissionRaised: boolean
  policyNever: boolean
  now: number
}

export interface RuleMatch {
  matched: boolean
  action: 'allow' | 'ask' | 'deny' | 'none'
  reason: string
  ruleId?: string
  capabilityBlocked?: boolean
}

export interface CapabilityStatus {
  automatic: boolean
  reason: string
}

export interface ApprovalDashboard {
  version: 1
  revision: number
  records: ReviewRecord[]
  rules: ApprovalRule[]
  nextBefore?: number
  capabilities: { creatorPlus: CapabilityStatus; creator: CapabilityStatus }
  storage: { ok: boolean; reason?: string; retentionDays: number; maxRecords: number }
}

/** Optional settings, resolved by the Host's schema before each operation. */
export interface ApprovalSettings {
  enabled?: boolean
  modelMode?: 'follow-agent' | 'fixed'
  reviewerRoute?: string
  reasoningMode?: 'low' | 'provider-default'
  timeoutMs?: number
  transportRetries?: number
  maxOutputTokens?: number
  maxInputChars?: number
  reviewHistoryPairs?: number
  reviewHistoryChars?: number
  failureMode?: 'human' | 'reject'
  historyRetentionDays?: number
  historyMaxRecords?: number
}

/** POST body. Rule mutations use optimistic concurrency; preview never executes a tool. */
export type ApprovalApiCommand =
  | { action: 'save-rule'; expectedRevision: number; rule: ApprovalRule }
  | { action: 'delete-rule'; expectedRevision: number; id: string }
  | { action: 'preview'; rule: ApprovalRule; recordId: string }
  | { action: 'clear-history'; expectedRevision: number }
