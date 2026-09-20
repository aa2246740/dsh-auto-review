/** Unified DSH model selection, bounded context framing, and strict decision parsing. */
import type { Context } from '@deepseek-ai/cordis';
export { redactArguments } from './redaction.ts';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type LlmResolvedModelInfo, type ReasoningEffortId as ReasoningEffort } from '@deepseek-ai/dsh-llm';
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ReviewerSettings } from './dsh-approve-for-me.ts';
export type ReviewAction = 'allow' | 'deny';
export type ReviewRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ReviewUserAuthorization = 'unknown' | 'low' | 'medium' | 'high';
export type ReviewFailureKind = 'timeout' | 'configuration' | 'transport' | 'invalid-response' | 'missing-context' | 'unknown';
/** Closed decision vocabulary shared by the deterministic and model paths. */
export type ReviewDecision = {
    source: 'model' | 'deterministic';
    decision: ReviewAction;
    riskLevel: ReviewRiskLevel;
    userAuthorization: ReviewUserAuthorization;
    reason: string;
    /** Actual resolved provider/model, never inferred by the UI. */
    model?: string;
} | {
    source: 'failure';
    decision: 'deny';
    failureKind: ReviewFailureKind;
    reason: string;
    /** Actual resolved provider/model, never inferred by the UI. */
    model?: string;
};
/** Completed prior tool evidence; never treated as direct user authority. */
export interface ReviewExecutionEvidence {
    toolName: string;
    arguments: unknown;
    result: string;
}
/** One successful user-interaction result, bound to the question that elicited it. */
export interface TrustedUserResponse {
    toolName: 'ask_user_question';
    authorizationScope: 'question-only';
    question: unknown;
    response: unknown;
}
/** Immutable facts sent to one reviewer call. */
export interface ReviewSubject {
    stage: 'pre-execute' | 'approval-request';
    toolName: string;
    arguments: unknown;
    /** Process-local route source; never serialized into the reviewer prompt. */
    agent?: Agent;
    cwd?: string;
    recentUserRequests: string[];
    trustedDeveloperInstructions: string[];
    trustedUserResponses: TrustedUserResponse[];
    recentAssistantMessages: string[];
    recentExecutionEvidence: ReviewExecutionEvidence[];
    downstream: PreToolDecision;
    approvalReason?: string;
}
export interface ReviewerRoute {
    provider: string;
    providerName: string;
    model: string;
    modelName: string;
    reasoningEffort?: ReasoningEffort;
}
/** Parse the atomic `[provider, model]` setting. */
export declare function parseReviewerRoute(value: string | undefined): {
    provider: string;
    model: string;
} | undefined;
/** Match Codex Guardian: request `low` reasoning when the model advertises it. */
export declare function preferredLowReasoningEffort(info: LlmResolvedModelInfo): ReasoningEffort | undefined;
/** Parse Codex Guardian's structured assessment contract. */
export declare function parseReviewDecision(text: string): ReviewDecision;
/** Runtime reviewer bound to the live settings source and registered DSH routes. */
export declare class ApprovalReviewer {
    private readonly ctx;
    private readonly settings;
    private readonly sessions;
    constructor(ctx: Context, settings: () => ReviewerSettings);
    /** Snapshot one pending tool call plus bounded authorization and execution context. */
    subject(exec: ToolExecution, downstream: PreToolDecision): ReviewSubject;
    /** One total deadline includes route resolution, provider stalls and all retries. */
    review(subject: ReviewSubject, parentSignal?: AbortSignal): Promise<ReviewDecision>;
    /** Log only decision metadata; never log arguments, prompts, or credentials. */
    log(stage: ReviewSubject['stage'], toolName: string, decision: ReviewDecision): void;
    private runAttempt;
    private resolveRoute;
    private selectFollowRoute;
}
//# sourceMappingURL=reviewer.d.ts.map