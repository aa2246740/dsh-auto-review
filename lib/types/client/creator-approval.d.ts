/** Independent Creator confirmation UI. No production entry, Remote subscription or HTTP endpoint is installed here. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { PendingInteractionPublisher } from '@deepseek-ai/dsh-client-ui-session/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ReactNode } from 'react';
import type { CreatorGrantOperation } from '../creator-grant-types.ts';
import type { CreatorApprovalLifetime, CreatorApprovalPrompt, CreatorApprovalResult, CreatorRememberDays } from '../creator-approval-contract.ts';
/** The signal is a live presentation lifetime, never part of the JSON prompt/decision. */
export interface CreatorApprovalPresentation {
    prompt: CreatorApprovalPrompt;
    signal?: AbortSignal;
}
export type CreatorApprovalPendingStatus = 'pending' | 'answered' | 'delegated' | 'cancelled';
declare module '@deepseek-ai/dsh-client-ui-session/client' {
    interface SessionPendingInteractionMap {
        'creator-approval': PendingCreatorApproval;
    }
}
/** Exactly one answerable, Session-scoped presentation. Its key is not a Host authorization token. */
export declare class PendingCreatorApproval {
    #private;
    readonly sessionId: SessionId;
    readonly kind = "creator-approval";
    readonly key: string;
    readonly prompt: CreatorApprovalPrompt;
    readonly result: Promise<CreatorApprovalResult>;
    constructor(sessionId: SessionId, presentation: CreatorApprovalPresentation);
    readonly getSnapshot: () => CreatorApprovalPendingStatus;
    readonly subscribe: (listener: () => void) => (() => void);
    /** Explicit UI decision only; validation never turns a native/AI result into a remembered grant. */
    answer(value: CreatorApprovalResult): Promise<void>;
    /** User cancellation or plugin-domain teardown delegates without creating an answer. */
    delegate(): void;
    isDelegation(reason: unknown): boolean;
    /** A Host/transport abort cancels, rather than opening a fresh fallback question. */
    abort(reason?: unknown): void;
    private finish;
}
export interface CreatorApprovalDraft {
    lifetime: CreatorApprovalLifetime;
    operations: CreatorGrantOperation[];
    rememberDays: CreatorRememberDays;
    operationsExpanded: boolean;
    phase: 'edit' | 'confirm-remember';
    acknowledged: boolean;
}
export type CreatorApprovalDraftAction = {
    type: 'lifetime';
    value: CreatorApprovalLifetime;
} | {
    type: 'operations-expanded';
    value: boolean;
} | {
    type: 'operation';
    operation: CreatorGrantOperation;
    selected: boolean;
} | {
    type: 'remember-days';
    value: CreatorRememberDays;
} | {
    type: 'review';
} | {
    type: 'back';
} | {
    type: 'acknowledge';
    value: boolean;
};
export declare function createCreatorApprovalDraft(prompt: CreatorApprovalPrompt): CreatorApprovalDraft;
/** Pure interaction state: selecting scopes/options never settles a request. */
export declare function reduceCreatorApprovalDraft(prompt: CreatorApprovalPrompt, state: CreatorApprovalDraft, action: CreatorApprovalDraftAction): CreatorApprovalDraft;
/** A remember reply requires a separate review step AND an initially unchecked acknowledgement. */
export declare function creatorApprovalDraftResult(prompt: CreatorApprovalPrompt, state: CreatorApprovalDraft): CreatorApprovalResult | undefined;
export interface CreatorApprovalCopy {
    title: string;
    once: string;
    task: string;
    remember: string;
    scope: string;
    source: string;
    workspace: string;
    currentTask: string;
    onceHint: string;
    taskHint: string;
    rememberHint: string;
    unavailable: string;
    operationScope: string;
    current: string;
    duration: string;
    day: string;
    days: string;
    review: string;
    reviewTitle: string;
    futureVersions: string;
    acknowledgement: string;
    allow: string;
    confirmRemember: string;
    reject: string;
    cancel: string;
    back: string;
    reason: string;
    boundary: string;
    settled: string;
    settlementFailed: string;
    operations: Record<CreatorGrantOperation, string>;
}
export declare const CREATOR_APPROVAL_COPY: Readonly<Record<'en' | 'zh', CreatorApprovalCopy>>;
export interface CreatorApprovalViewProps {
    prompt: CreatorApprovalPrompt;
    draft: CreatorApprovalDraft;
    idPrefix: string;
    busy?: boolean;
    error?: string;
    copy?: CreatorApprovalCopy;
    onAction: (action: CreatorApprovalDraftAction) => void;
    onSubmit: () => void;
    onReject: () => void;
    onCancel: () => void;
}
/** Controlled production view, also renderable without a live Host for isolated layout tests. */
export declare function CreatorApprovalView({ prompt, draft, idPrefix, busy, error, copy, onAction, onSubmit, onReject, onCancel }: CreatorApprovalViewProps): ReactNode;
/** React unmount from switching Sessions is NOT cancellation; the public pending domain owns its lifetime. */
export declare function CreatorApprovalCard({ pending, copy }: {
    pending: PendingCreatorApproval;
    copy?: CreatorApprovalCopy;
}): ReactNode;
/** One scoped Remote Event handler's lifecycle, without subscribing to any remote event. */
export declare function presentCreatorApproval(sessionId: SessionId | undefined, presentation: CreatorApprovalPresentation, next: () => Promise<CreatorApprovalResult>, publish: PendingInteractionPublisher<PendingCreatorApproval>): Promise<CreatorApprovalResult>;
/** Declare these direct reads plus any public client service the caller's scope resolver reads. */
export declare const CREATOR_APPROVAL_CLIENT_INJECT: readonly ["uiSession", "slots"];
/** Public client scope lookup signature; never a model/sessionId field or Host SessionStore assertion. */
export type CreatorApprovalScopeResolver = (owner: ClientContext) => SessionId | undefined;
export type ScopedCreatorApprovalHandler = (this: ClientContext, presentation: CreatorApprovalPresentation, next: () => Promise<CreatorApprovalResult>) => Promise<CreatorApprovalResult>;
/**
 * Opt-in public domain/composer wiring. Returns a scoped handler; does NOT call remote.$on.
 * A mandatory resolver supplied from the real public client scope service avoids the
 * Host/client Context.sessions declaration collision in this mixed package. No runtime
 * copy of the scope module/private Symbol is imported, and no service type is asserted.
 * The caller owns its resolver's public client service injection and shared-module identity.
 * The current Host Remote assembly has a static allowlist and a sole forwarding source.
 * A supported future forwarding extension must be proven before subscribing this handler.
 */
export declare function registerCreatorApprovalPresentation(ctx: ClientContext, resolveSession: CreatorApprovalScopeResolver, copy?: CreatorApprovalCopy): ScopedCreatorApprovalHandler;
//# sourceMappingURL=creator-approval.d.ts.map