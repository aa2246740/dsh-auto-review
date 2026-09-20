import ApprovalService from '@deepseek-ai/dsh-user-approval';
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval';
import { CreatorGrantStore } from './creator-grants.ts';
import type { CreatorGrantBinding, CreatorGrantOperation } from './creator-grant-types.ts';
import { CreatorConsentRegistry } from './creator-consent.ts';
export interface CreatorOwnerInspection {
    exactNativeRequest: ApprovalRequest;
    binding: CreatorGrantBinding;
    operation: CreatorGrantOperation;
    policyEpoch: object;
    signal?: AbortSignal;
    taskHandle?: object;
    /** Required with taskHandle. The reader must additionally verify that task's identity and liveness. */
    taskSignal?: AbortSignal;
}
export interface CreatorPreparedInspection {
    owner: object;
    binding: CreatorGrantBinding;
    operation: CreatorGrantOperation;
    /** Stable, frozen opaque seal; reader must return undefined after invalidation/unsupported preparation. */
    seal: object;
    /** Native ticket TTL/target-registration/cancellation signal, independent of the owner's signal. */
    signal: AbortSignal;
}
export type CreatorExecutionCapability = Readonly<Record<string, never>>;
export type CreatorAuthorizationSource = 'consent-once' | 'task' | 'remembered' | 'native-delegation';
/** Closed, bounded dispatch-audit DTO: no owner, preparation, request, path, view nonce or arbitrary reason. */
export interface CreatorExecutionAudit {
    protocol: 1;
    id: string;
    capabilityId: string;
    at: number;
    phase: 'dispatch-precheck' | 'continuation-precheck';
    observed: 'prechecks-passed';
    source: CreatorAuthorizationSource;
    operation: CreatorGrantOperation;
    bindingHash: string;
    grant?: {
        id: string;
        version: number;
    };
}
export interface CreatorAuthorizerOptions {
    approval: ApprovalService;
    store: CreatorGrantStore;
    consent: CreatorConsentRegistry;
    isCurrentOwner: () => boolean;
    inspectOwner: (owner: object) => CreatorOwnerInspection | undefined;
    inspectPrepared: (preparation: object) => CreatorPreparedInspection | undefined;
    supportedOperations: readonly CreatorGrantOperation[];
    /** Must synchronously return true only after accepting this bounded audit row; Promise/throw denies and burns. */
    audit: (event: Readonly<CreatorExecutionAudit>) => true;
    now?: () => number;
    /** Optional reductions, bounded by 64 in-flight requests and five minutes per execution capability. */
    maxPending?: number;
    ttlMs?: number;
}
export type CreatorAuthorizerFailure = 'invalid-options' | 'invalid-owner' | 'invalid-preparation' | 'unsupported-operation' | 'duplicate-owner' | 'duplicate-request' | 'duplicate-preparation' | 'capacity' | 'closed' | 'not-current-owner' | 'callback-invalid' | 'clock-invalid' | 'reentrant' | 'native-never' | 'native-denied' | 'native-bypass' | 'owner-changed' | 'preparation-changed' | 'aborted' | 'expired' | 'consent-denied' | 'store-unhealthy' | 'remember-save-failed' | 'task-invalid' | 'grant-invalid' | 'unknown-capability' | 'capability-used' | 'capability-binding' | 'not-started' | 'audit-failed' | 'internal-error';
export declare class CreatorAuthorizerError extends Error {
    readonly code: CreatorAuthorizerFailure;
    constructor(code: CreatorAuthorizerFailure);
}
export declare class CreatorAuthorizer {
    #private;
    constructor(options: CreatorAuthorizerOptions);
    /** One new C owner + one new sealed preparation. No retry/memoized capability issuance. */
    authorize(owner: object, preparation: object): Promise<CreatorExecutionCapability>;
    /** Private listener only. Unknown exact objects delegate unchanged; known repeats never reopen a question. */
    handleNativeRequest(request: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>;
    /** Burn before every check/sink. Failure, wrong owner/preparation, cancellation and exceptions never refund. */
    consume(capability: object, owner: object, preparation: object): true;
    /** Post-await continuation check only. This never consumes twice or authorizes another dispatch. */
    revalidateStarted(capability: object, owner: object, preparation: object): true;
    /** Revokes current in-memory rules/caps; a fresh owner can only reacquire one via a new explicit confirmation. */
    revokeTask(task: object): void;
    health(): {
        ok: boolean;
        pending: number;
        reason?: CreatorAuthorizerFailure;
    };
    dispose(): void;
}
//# sourceMappingURL=creator-authorizer.d.ts.map