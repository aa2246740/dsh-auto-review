import type { CreateCreatorRememberedGrant, CreatorGrantBinding, CreatorGrantFailure, CreatorGrantHealth, CreatorGrantOperation, CreatorGrantStoreOptions, CreatorRememberedGrant } from './creator-grant-types.ts';
export type { CreateCreatorRememberedGrant, CreatorGrantBinding, CreatorGrantEvent, CreatorGrantFailure, CreatorGrantHealth, CreatorGrantOperation, CreatorGrantStoreOptions, CreatorRememberedGrant, } from './creator-grant-types.ts';
export declare const CREATOR_GRANT_MAX_LIFETIME_MS: number;
export declare const CREATOR_GRANT_FILENAME = "creator-grants-v1.json";
/** Deliberately generic: exception messages contain neither source paths nor confirmation payloads. */
export declare class CreatorGrantStoreError extends Error {
    readonly code: CreatorGrantFailure;
    constructor(code: CreatorGrantFailure);
}
/**
 * One immutable-snapshot reader/writer. A second writer or external replacement suspends
 * older instances; construct a new current-owner instance to intentionally adopt a snapshot.
 * An unknown lock is never stolen, even after restart. No legacy approval store is read.
 */
export declare class CreatorGrantStore {
    readonly path: string;
    private readonly directory;
    private readonly lockPath;
    private readonly options;
    private state;
    private anchor;
    private directoryIdentity;
    private fault;
    private disposed;
    private lastClock;
    private readonly localDenials;
    constructor(options: CreatorGrantStoreOptions);
    private code;
    private suspend;
    private assertOwner;
    private clock;
    private checkDirectory;
    private checkLock;
    private readDisk;
    private verify;
    private requireHealthy;
    /** Checks ownership, disk identity, lock state and health synchronously on every call. */
    health(): CreatorGrantHealth;
    /** Detached metadata only; a stale owner/suspicious snapshot exposes no matchable records. */
    list(): CreatorRememberedGrant[];
    /** Re-run at the consumer's final dispatch fence; even a match is NOT a reusable execution ticket. */
    findMatch(value: CreatorGrantBinding, action: CreatorGrantOperation): CreatorRememberedGrant | undefined;
    /** Internal Host API only. A confirmation is at most one creation, including after deletion. */
    createRemembered(value: CreateCreatorRememberedGrant, expectedRevision?: number): CreatorRememberedGrant;
    disable(id: string, expectedRevision?: number): CreatorRememberedGrant;
    revoke(id: string, expectedRevision?: number): CreatorRememberedGrant;
    /** Deletes the rule, NOT its confirmation tombstone. Returns the removed record. */
    delete(id: string, expectedRevision?: number): CreatorRememberedGrant;
    private deny;
    private checkRevision;
    private change;
    private acquire;
    private release;
    private commit;
    /** No write on teardown. Old generations may neither overwrite nor resurrect current state. */
    dispose(): void;
}
//# sourceMappingURL=creator-grants.d.ts.map