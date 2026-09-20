/**
 * Private A factory for one Root ApprovalService + one GrantStore.
 * Each producer gets its own Authorizer/Registry and a real approval/request
 * prepend hook. This is not an HTTP grant API and does not mint capabilities
 * from JSON, callId, or native allowed-once alone.
 */
import type { Context } from '@deepseek-ai/cordis';
import { CreatorAuthorizer } from './creator-authorizer.ts';
import type { CreatorExecutionAudit, CreatorOwnerInspection, CreatorPreparedInspection } from './creator-authorizer.ts';
import { CreatorConsentRegistry } from './creator-consent.ts';
import { CreatorGrantStore } from './creator-grants.ts';
import type { CreatorGrantOperation } from './creator-grant-types.ts';
export interface CreatorAuthorizerFactoryInput {
    signal: AbortSignal;
    inspectOwner(owner: object): CreatorOwnerInspection | undefined;
    inspectPrepared(preparation: object): CreatorPreparedInspection | undefined;
    supportedOperations: readonly CreatorGrantOperation[];
}
export interface CreatorAuthorizerLease {
    signal: AbortSignal;
    authorize(owner: object, preparation: object): Promise<object>;
    consume(capability: object, owner: object, preparation: object): true;
    revalidateStarted(capability: object, owner: object, preparation: object): true;
    dispose(): void;
}
export interface CreatorAuthorizerMember {
    consent: CreatorConsentRegistry;
    authorizer: CreatorAuthorizer;
    dispose(): void;
}
export interface CreatorAuthorizerHostOptions {
    store: CreatorGrantStore;
    isCurrentOwner: () => boolean;
    audit: (event: Readonly<CreatorExecutionAudit>) => true;
    now?: () => number;
}
export declare class CreatorAuthorizerHostError extends Error {
    readonly code: string;
    constructor(code: string);
}
export declare class CreatorAuthorizerHost {
    readonly members: CreatorAuthorizerMember[];
    readonly createAuthorizer: (input: CreatorAuthorizerFactoryInput) => CreatorAuthorizerLease;
    private readonly life;
    private readonly store;
    constructor(ctx: Context, options: CreatorAuthorizerHostOptions);
    pending(sessionId: string): Array<{
        member: CreatorAuthorizerMember;
        listing: ReturnType<CreatorConsentRegistry['list']>[number];
    }>;
    private registry;
    list(sessionId: string): import("./creator-consent.ts").CreatorConsentListing[];
    present(id: string, sessionId: string): import("./creator-consent.ts").CreatorConsentView;
    confirm(id: string, nonce: string, answer: unknown): import("./creator-consent.ts").CreatorConsentAcknowledgement;
    delegate(id: string, nonce: string): Readonly<{
        id: string;
        status: "delegated" | "duplicate";
    }>;
    grants(): {
        revision: number;
        rules: import("./creator-grant-types.ts").CreatorRememberedGrant[];
        storage: import("./creator-grant-types.ts").CreatorGrantHealth;
    };
    revoke(id: string, revision: number): {
        revision: number;
        rules: import("./creator-grant-types.ts").CreatorRememberedGrant[];
        storage: import("./creator-grant-types.ts").CreatorGrantHealth;
    };
    invalidate(): void;
    dispose(): void;
}
export declare function createCreatorAuthorizerHost(ctx: Context, options: CreatorAuthorizerHostOptions): CreatorAuthorizerHost;
//# sourceMappingURL=creator-authorizer-host.d.ts.map