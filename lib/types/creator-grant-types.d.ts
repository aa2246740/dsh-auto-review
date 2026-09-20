/** Private Host contracts. A remembered rule is NOT an executable capability. */
export declare const CREATOR_GRANT_OPERATIONS: readonly ["check", "activation-plan", "hot-reload", "activate-new-client"];
export type CreatorGrantOperation = typeof CREATOR_GRANT_OPERATIONS[number];
/** Every field is resolved by the Host, never accepted from model tool arguments. */
export interface CreatorGrantBinding {
    engine: 'creator-plus-v1';
    harnessRoot: string;
    sourceRoot: string;
    pluginId: string;
    sourceDirectoryIdentity: {
        dev: string;
        ino: string;
    };
    /** Required exact canonical workspace of the requesting Session. */
    workspaceRoot: string;
}
/** Only an explicit, independently authenticated Host confirmation may call createRemembered. */
export interface CreateCreatorRememberedGrant {
    binding: CreatorGrantBinding;
    operations: CreatorGrantOperation[];
    expiresAt: number;
    confirmationId: string;
    futureVersions: true;
    /** Fail closed by default. A confirmed Host controller must deliberately set true. */
    enabled?: boolean;
}
export interface CreatorRememberedGrant {
    id: string;
    version: number;
    binding: CreatorGrantBinding;
    operations: CreatorGrantOperation[];
    createdAt: number;
    expiresAt: number;
    confirmationId: string;
    futureVersions: true;
    enabled: boolean;
    revokedAt?: number;
}
/** Bounded metadata, without paths, executable payloads, UI nonces or arbitrary explanations. */
export interface CreatorGrantEvent {
    id: string;
    at: number;
    action: 'create' | 'disable' | 'revoke' | 'delete';
    grantId: string;
    grantVersion: number;
    revision: number;
    bindingHash: string;
    operations: CreatorGrantOperation[];
}
export type CreatorGrantFailure = 'invalid-input' | 'conflict' | 'confirmation-used' | 'capacity' | 'not-found' | 'disposed' | 'not-current-owner' | 'unsafe-storage' | 'storage-corrupt' | 'external-change' | 'locked' | 'write-failed' | 'clock-invalid';
export interface CreatorGrantHealth {
    ok: boolean;
    revision: number;
    reason?: CreatorGrantFailure;
    /** False after a local deny could not be durably committed; never claim restart-safe revocation. */
    durableRevocationGuaranteed: boolean;
}
export interface CreatorGrantStoreOptions {
    directory: string;
    /** Permanently revocable broker ownership lease; newer-generation disposal must never revive it. An exception is a denial. */
    isCurrentOwner?: () => boolean;
    now?: () => number;
}
//# sourceMappingURL=creator-grant-types.d.ts.map