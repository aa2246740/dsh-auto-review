import type { CreatorConsentTransport } from './creator-consent-transport.tsx';
export declare function createCreatorConsentHttpTransport(): CreatorConsentTransport;
export interface RememberedGrantRow {
    id: string;
    version: number;
    pluginId: string;
    operations: string[];
    createdAt: number;
    expiresAt: number;
    enabled: boolean;
    revokedAt?: number;
}
export declare function getRememberedGrants(signal?: AbortSignal): Promise<{
    revision: number;
    rules: RememberedGrantRow[];
}>;
export declare function revokeRememberedGrant(id: string, expectedRevision: number): Promise<{
    revision: number;
    rules: RememberedGrantRow[];
}>;
//# sourceMappingURL=creator-consent-http.d.ts.map