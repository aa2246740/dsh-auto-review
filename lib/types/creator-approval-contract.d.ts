import type { CreatorGrantOperation } from './creator-grant-types.ts';
/** A name reserved for a future supported forwarding source; exporting it does not register one. */
export declare const CREATOR_APPROVAL_EVENT = "creator-approval/request";
export type CreatorApprovalLifetime = 'once' | 'task' | 'remember';
export type CreatorRememberDays = 1 | 7 | 30;
export interface CreatorApprovalPrompt {
    protocol: 1;
    id: string;
    pluginId: string;
    sourceLabel: string;
    workspaceLabel: string;
    currentOperation: CreatorGrantOperation;
    availableOperations: CreatorGrantOperation[];
    allowTask: boolean;
    allowRemember: boolean;
    taskLabel: string;
    reason?: string;
}
export type CreatorApprovalResult = {
    decision: 'reject';
} | {
    decision: 'allow';
    lifetime: 'once' | 'task';
    operations: CreatorGrantOperation[];
} | {
    decision: 'allow';
    lifetime: 'remember';
    operations: CreatorGrantOperation[];
    rememberDays: CreatorRememberDays;
};
/** Detached, strictly bounded display data. Host-generated labels are not execution bindings. */
export declare function parseCreatorApprovalPrompt(value: unknown): CreatorApprovalPrompt;
/** Only explicit closed decisions are valid; native allowed-once and AI-shaped results are not this protocol. */
export declare function parseCreatorApprovalResult(value: unknown, prompt: CreatorApprovalPrompt): CreatorApprovalResult;
//# sourceMappingURL=creator-approval-contract.d.ts.map