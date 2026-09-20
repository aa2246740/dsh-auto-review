/** Bounded reviewer conversation reuse with ephemeral forks under concurrency. */
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type Message } from '@deepseek-ai/dsh-llm';
export interface ReviewSessionRoute {
    readonly provider: string;
    readonly model: string;
}
export interface ReviewSessionLease {
    readonly priorMessages: readonly Message[];
    readonly ephemeral: boolean;
    commit(input: string, output: string): void;
    release(): void;
}
export interface ReviewSessionLimits {
    readonly maxPairs: number;
    readonly maxChars: number;
}
export declare const DEFAULT_REVIEW_HISTORY_PAIRS = 4;
export declare const DEFAULT_REVIEW_HISTORY_CHARS = 20000;
/**
 * Reuses one bounded reviewer conversation per parent agent, route, policy
 * version, and trusted-authorization version. A concurrent review receives an
 * ephemeral empty-history lease rather than sharing mutable conversation state.
 */
export declare class ReviewSessionManager {
    private readonly sessions;
    acquire(agent: Agent | undefined, route: ReviewSessionRoute, authorizationVersion: string, limits: ReviewSessionLimits): ReviewSessionLease;
}
//# sourceMappingURL=review-session.d.ts.map