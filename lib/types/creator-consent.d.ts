import type { CreatorApprovalPrompt, CreatorApprovalResult } from './creator-approval-contract.ts';
export declare const CREATOR_CONSENT_MAX_PENDING = 64;
export declare const CREATOR_CONSENT_TTL_MS: number;
/** Object identity is meaningful only to the mandatory Host validateOwner closure. */
export type CreatorConsentOwner = object;
export type CreatorConsentPromptInput = Omit<CreatorApprovalPrompt, 'id'>;
export interface CreatorConsentRegistryOptions {
    /** Permanently revocable generation lease; observing false permanently closes this instance. */
    isCurrentOwner: () => boolean;
    validateOwner: (owner: CreatorConsentOwner) => boolean;
    sessionOfOwner: (owner: CreatorConsentOwner) => string | undefined;
    now?: () => number;
    /** Optional reductions for bounded callers/tests; cannot exceed 64 or five minutes. */
    maxPending?: number;
    ttlMs?: number;
}
export type CreatorConsentCancellation = 'cancelled' | 'disconnected' | 'revoked' | 'aborted' | 'expired' | 'disposed' | 'owner-invalid' | 'session-changed' | 'not-current-owner' | 'clock-invalid' | 'callback-invalid' | 'reentrant';
export type CreatorConsentFailure = CreatorConsentCancellation | 'invalid-options' | 'invalid-input' | 'capacity' | 'not-found' | 'session-mismatch' | 'invalid-view' | 'conflict' | 'entropy-failed';
export declare class CreatorConsentError extends Error {
    readonly code: CreatorConsentFailure;
    constructor(code: CreatorConsentFailure);
}
/** A correlation result only. A reject remains an explicit reject; delegation/cancellation are not answers. */
export type CreatorConsentOutcome = {
    kind: 'consent';
    id: string;
    answer: CreatorApprovalResult;
} | {
    kind: 'delegated';
    id: string;
} | {
    kind: 'cancelled';
    id: string;
    reason: CreatorConsentCancellation;
};
/** Host-only handle: its original Promise settles once and never rejects. Do not serialize or expose it. */
export interface CreatorConsentHandle {
    id: string;
    expiresAt: number;
    result: Promise<CreatorConsentOutcome>;
}
/** These are bounded, detached, redacted display fields, not a bound execution target. */
export interface CreatorConsentListing {
    prompt: CreatorApprovalPrompt;
    expiresAt: number;
}
export interface CreatorConsentView extends CreatorConsentListing {
    viewNonce: string;
}
export interface CreatorConsentAcknowledgement {
    id: string;
    status: 'accepted' | 'duplicate';
}
export interface CreatorConsentHealth {
    ok: boolean;
    pending: number;
    receipts: number;
    reason?: CreatorConsentCancellation;
}
/**
 * At most maxPending live entries AND maxPending recent answer receipts. Receipts
 * are evicted oldest-first, never extend the original TTL and cannot resurrect a
 * retired id. All requests have an unref'ed hard timeout in addition to wall-clock
 * checks on every operation. sweep() is available for explicit Host lifecycle ticks.
 *
 * On missing owner/generation, callback failure/async/reentry, clock rollback or
 * unload, no old instance is revived. No disk, network or executable metadata is used.
 */
export declare class CreatorConsentRegistry {
    #private;
    constructor(options: CreatorConsentRegistryOptions);
    open(owner: CreatorConsentOwner, promptWithoutId: CreatorConsentPromptInput, signal?: AbortSignal): CreatorConsentHandle;
    list(sessionId: string): CreatorConsentListing[];
    /** Each display rotates the nonce, invalidating all previous views without extending expiry. */
    present(id: string, sessionId: string): CreatorConsentView;
    /**
     * Correlate an answer with an existing view. No caller/session/human identity is
     * authenticated here: the future transport/broker must supply that independent gate.
     * Only open().result supplies the single private outcome; this ack is not a permit.
     */
    confirm(id: string, viewNonce: string, answer: unknown): CreatorConsentAcknowledgement;
    /** Trusted Host lifecycle cancellation only; not an HTTP endpoint. Terminal ids are never reopened. */
    cancel(id: string, reason?: 'cancelled' | 'disconnected'): boolean;
    /** Delegate the original Host request; do not manufacture reject/allow or call a model. */
    delegate(id: string): boolean;
    /** Private routing lookup: no permission, nonce, or owner information. */
    has(id: string): boolean;
    /** Request-specific browser delegation, with the same nonce fence as confirm. */
    delegatePresented(id: string, viewNonce: string): Readonly<{
        id: string;
        status: 'delegated' | 'duplicate';
    }>;
    /** Revocation is permanent for this reference, even if an erroneous callback later says true. */
    revokeOwner(owner: CreatorConsentOwner): number;
    /** Explicit cleanup/checkpoint; hard timers also clean up without polling or cooperative callers. */
    sweep(): number;
    health(): CreatorConsentHealth;
    /** Unload is monotonic and does not invoke untrusted callbacks or wait on any remote work. */
    dispose(): void;
}
//# sourceMappingURL=creator-consent.d.ts.map