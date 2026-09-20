/** Approval-only routing: exact-call correlation, recoverable failures and one-shot human handoff. */
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval';
import type { PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { ApprovalReviewer } from './reviewer.ts';
import type { ReviewAuditPort } from './audit.ts';
import type { ReviewStage, RuleMatch } from './contracts.ts';
type ReviewerPort = Pick<ApprovalReviewer, 'subject' | 'review' | 'log'>;
export interface CoordinatorOptions {
    failureMode?: () => 'human' | 'reject';
    canAsk?: (agent: Agent) => boolean;
    audit?: ReviewAuditPort;
    rule?: (exec: ToolExecution, stage: ReviewStage) => RuleMatch;
}
/** One coordinator per plugin scope. No cached decision can authorize a different approval request. */
export declare class AutoReviewCoordinator {
    private readonly reviewer;
    private readonly active;
    private readonly options;
    private readonly pending;
    private readonly circuits;
    private readonly lifetime;
    private readonly policyWaits;
    constructor(reviewer: ReviewerPort, active: (agent: Agent) => boolean, options?: CoordinatorOptions);
    /** Only committed public events can cancel waits; cloned/uncommitted/foreign receipts are ignored. */
    observePolicyEvent(session: Agent['session'], event: SessionEvent): void;
    private capturePolicy;
    private policyLive;
    private watchPolicy;
    private unwatchPolicy;
    private cancelledPolicy;
    preExecute(exec: ToolExecution, downstream: PreToolDecision): Promise<PreToolDecision>;
    /** A borrowed request object is not an invocation ID. Every native ask needs its own decision. */
    approvalRequest(request: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>;
    private handleRequest;
    private humanFallback;
    private prepareHandoff;
    private assess;
    private delegate;
    toolResult(exec: Readonly<ToolExecution>, result?: Readonly<ToolExecutionResult>): void;
    private injectFeedback;
    private recordDecision;
    /** Called before audit disposal during HMR; pending answers lose authority. */
    dispose(): void;
}
/** The real entry and tests share this public, owning-scope cancellation subscription. No routes/services are installed. */
export declare function registerCoordinatorPolicyEvents(ctx: Context, coordinator: AutoReviewCoordinator): void;
export {};
//# sourceMappingURL=coordinator.d.ts.map