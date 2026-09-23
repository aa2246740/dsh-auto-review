import type { Context } from '@deepseek-ai/cordis';
import type { ApprovalSettings } from './contracts.ts';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
import z from '@deepseek-ai/schemastery';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'dsh-approve-for-me': {
            kind: 'dsh-approve-for-me';
        } & ContextFormed;
    }
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Official Web permission-preset service required by this plugin. */
        permissionPresets: {
            current(session: Agent['session']): string;
        };
    }
}
export declare const name = "dsh-approve-for-me";
export declare const inject: string[];
/** Permission-preset key that delegates approval requests to this reviewer. */
export declare const APPROVE_FOR_ME_PRESET = "approve-for-me";
/** Durable settings namespace shared with the browser half. */
export declare const APPROVE_FOR_ME_SETTINGS_NAMESPACE = "dsh-approve-for-me";
/** User-owned reviewer settings. */
export interface ReviewerSettings extends ApprovalSettings {
    /** Whether the reviewer participates in approval waterfalls. */
    enabled?: boolean;
    /** Follow the current agent route, or use one explicit registered DSH route. */
    modelMode?: 'follow-agent' | 'fixed';
    /** JSON tuple `[provider, model]`, written atomically by the browser. */
    reviewerRoute?: string;
    /** Prefer the model's `low` effort when available, or preserve its default. */
    reasoningMode?: 'low' | 'provider-default';
    /** Total deadline shared by every reviewer attempt. */
    timeoutMs?: number;
    /** Additional attempts for transient transport or malformed-output failures. */
    transportRetries?: number;
    /** Reviewer response ceiling. */
    maxOutputTokens?: number;
    /** Maximum framed authorization context sent to the reviewer. */
    maxInputChars?: number;
    /** Maximum prior reviewer assessment pairs retained in one reusable conversation. */
    reviewHistoryPairs?: number;
    /** Maximum serialized characters retained across prior reviewer assessments. */
    reviewHistoryChars?: number;
}
export type Config = ReviewerSettings;
/** Composition and durable settings schema. */
interface LiveValue<T> {
    get(): T | undefined;
}
/** Loader-resolved volatile config. Each decision calls `get()` so a settings write is visible immediately. */
export interface LiveReviewerConfig {
    enabled: LiveValue<boolean>;
    failureMode: LiveValue<'human' | 'reject'>;
    historyRetentionDays: LiveValue<number>;
    historyMaxRecords: LiveValue<number>;
    modelMode: LiveValue<'follow-agent' | 'fixed'>;
    reviewerRoute: LiveValue<string>;
    reasoningMode: LiveValue<'low' | 'provider-default'>;
    timeoutMs: LiveValue<number>;
    transportRetries: LiveValue<number>;
    maxOutputTokens: LiveValue<number>;
    maxInputChars: LiveValue<number>;
    reviewHistoryPairs: LiveValue<number>;
    reviewHistoryChars: LiveValue<number>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    failureMode: z<"human" | "reject", "human" | "reject", "volatile-defined">;
    historyRetentionDays: z<number, number, "volatile-defined">;
    historyMaxRecords: z<number, number, "volatile-defined">;
    modelMode: z<"follow-agent" | "fixed", "follow-agent" | "fixed", "volatile-defined">;
    reviewerRoute: z<string, string, "volatile-defined">;
    reasoningMode: z<"low" | "provider-default", "low" | "provider-default", "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    transportRetries: z<number, number, "volatile-defined">;
    maxOutputTokens: z<number, number, "volatile-defined">;
    maxInputChars: z<number, number, "volatile-defined">;
    reviewHistoryPairs: z<number, number, "volatile-defined">;
    reviewHistoryChars: z<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    failureMode: z<"human" | "reject", "human" | "reject", "volatile-defined">;
    historyRetentionDays: z<number, number, "volatile-defined">;
    historyMaxRecords: z<number, number, "volatile-defined">;
    modelMode: z<"follow-agent" | "fixed", "follow-agent" | "fixed", "volatile-defined">;
    reviewerRoute: z<string, string, "volatile-defined">;
    reasoningMode: z<"low" | "provider-default", "low" | "provider-default", "volatile-defined">;
    timeoutMs: z<number, number, "volatile-defined">;
    transportRetries: z<number, number, "volatile-defined">;
    maxOutputTokens: z<number, number, "volatile-defined">;
    maxInputChars: z<number, number, "volatile-defined">;
    reviewHistoryPairs: z<number, number, "volatile-defined">;
    reviewHistoryChars: z<number, number, "volatile-defined">;
}>>, "plain">;
/** True only for the explicit preset and an enabled reviewer kill switch. */
export declare function reviewerModeActive(ctx: Context, agent: Agent, settings: ReviewerSettings): boolean;
/** The public override intentionally omits the deployment default; include both before any fast path. */
export declare function canRequestApproval(ctx: Context, agent: Agent): boolean;
/** Install approval-only Auto-review without changing DSH core policy or tool definitions. */
export declare function apply(ctx: Context, config: LiveReviewerConfig): void;
export {};
//# sourceMappingURL=dsh-approve-for-me.d.ts.map