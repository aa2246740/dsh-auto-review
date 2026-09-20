/**
 * Opt-in public-client observation + typed transport. No URLs, HTTP adapter,
 * Remote subscription, Host API or production entry are installed here.
 * Transport authentication and a matching nonce are NOT proof of a human/source.
 *
 * Public seam: conversation.input.overlay (session/list) supplies the resident
 * composer's real sessionId. Its null observer never replaces the composer.
 * The official root calls renderSlotChain(...,{overlay:true}), keeping that
 * fallback mounted during takeovers. Chain selectors are pure first-match
 * elections, NOT middleware: no next/render-next API is assumed.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { PendingInteractionPublisher } from '@deepseek-ai/dsh-client-ui-session/client';
import type { ReactNode } from 'react';
import type { CreatorApprovalPrompt, CreatorApprovalResult } from '../creator-approval-contract.ts';
import { PendingCreatorApproval } from './creator-approval.tsx';
import type { CreatorApprovalDraft, CreatorApprovalDraftAction } from './creator-approval.tsx';
export interface CreatorConsentListItem {
    prompt: CreatorApprovalPrompt;
    expiresAt: number;
}
export interface CreatorConsentPresented extends CreatorConsentListItem {
    viewNonce: string;
}
export interface CreatorConsentConfirmInput {
    id: string;
    viewNonce: string;
    answer: CreatorApprovalResult;
}
export interface CreatorConsentDelegateInput {
    id: string;
    viewNonce: string;
}
export interface CreatorConsentConfirmAck {
    id: string;
    status: 'accepted' | 'duplicate';
}
export interface CreatorConsentDelegateAck {
    id: string;
    status: 'delegated' | 'duplicate';
}
export interface CreatorConsentTransport {
    list(sessionId: SessionId, signal: AbortSignal): Promise<readonly CreatorConsentListItem[]>;
    present(id: string, sessionId: SessionId, signal: AbortSignal): Promise<CreatorConsentPresented>;
    confirm(input: CreatorConsentConfirmInput, signal: AbortSignal): Promise<CreatorConsentConfirmAck>;
    /** A future server broker MUST validate this nonce. Never expose registry.delegate(id) directly. */
    delegate(input: CreatorConsentDelegateInput, signal: AbortSignal): Promise<CreatorConsentDelegateAck>;
}
export type CreatorConsentPhase = 'discovered' | 'presenting' | 'ready' | 'confirming' | 'delegating' | 'unknown' | 'ended' | 'acknowledged' | 'dismissed';
export interface CreatorConsentSnapshot {
    pending: PendingCreatorConsent;
    prompt: CreatorApprovalPrompt;
    expiresAt: number;
    draft: CreatorApprovalDraft;
    phase: CreatorConsentPhase;
    listed: boolean;
    canRetry: boolean;
}
/** Separate public pending kind: the old immediate-answer card cannot capture an ACK-gated request. */
export declare class PendingCreatorConsent {
    #private;
    readonly kind = "creator-consent";
    readonly key: string;
    readonly sessionId: SessionId;
    readonly result: Promise<CreatorApprovalResult>;
    constructor(pending: PendingCreatorApproval, owner: symbol);
    belongsTo(owner: symbol): boolean;
}
declare module '@deepseek-ai/dsh-client-ui-session/client' {
    interface SessionPendingInteractionMap {
        'creator-consent': PendingCreatorConsent;
    }
}
export interface CreatorConsentControllerOptions {
    transport: CreatorConsentTransport;
    publish: PendingInteractionPublisher<PendingCreatorConsent>;
    signal?: AbortSignal;
    now?: () => number;
    pollMs?: number;
    requestTimeoutMs?: number;
    maxPending?: number;
}
/**
 * Root-plugin-owned state, not React-owned request lifetime. Up to 64 known ids
 * (including short-lived completed-id tombstones) are retained until original TTL;
 * never evict a seen id early and accidentally present it again. Expired unknown
 * notices can remain visible for at most 30s, but network/actions stop at TTL.
 */
export declare class CreatorConsentController {
    #private;
    readonly ownerTag: symbol;
    constructor(options: CreatorConsentControllerOptions);
    readonly subscribe: (listener: () => void) => (() => void);
    snapshot(id: string): CreatorConsentSnapshot | undefined;
    snapshotByPending(pending: PendingCreatorConsent): CreatorConsentSnapshot | undefined;
    health(): {
        closed: boolean;
        known: number;
        observations: number;
        connection: string;
    };
    /** A read-only observation lease. Releasing it does NOT delegate/cancel any Host request. */
    observeSession(id: SessionId): () => void;
    pollNow(): Promise<void>;
    /** Called by the elected card's mount effect, not every poll or a render-time selector. */
    ensurePresented(id: string): Promise<boolean>;
    change(id: string, action: CreatorApprovalDraftAction): void;
    submit(id: string): Promise<boolean>;
    reject(id: string): Promise<boolean>;
    delegate(id: string): Promise<boolean>;
    /** Only the exact already-submitted intent may be retried after a missing ACK. */
    retry(id: string): Promise<boolean>;
    /** Close a local unknown notice. This says nothing about rejection/execution on the Host. */
    dismiss(id: string): void;
    dispose(): void;
}
export declare const CREATOR_CONSENT_TRANSPORT_COPY: {
    readonly zh: {
        readonly preparing: "正在准备服务器确认视图…";
        readonly waiting: "正在等待服务器确认回执…";
        readonly disappeared: "请求已从待办消失，尚未收到确认回执；状态未知。";
        readonly unknown: "未收到可靠的服务器回执；状态未知，不代表已拒绝或未执行。";
        readonly ended: "本地等待已结束；服务器状态未知，不代表已拒绝或未执行。";
        readonly retry: "重试同一提交";
        readonly dismiss: "关闭本地提示";
    };
    readonly en: {
        readonly preparing: "Preparing the server confirmation view…";
        readonly waiting: "Waiting for the server acknowledgement…";
        readonly disappeared: "The request is no longer listed, but no acknowledgement has arrived. Its status is unknown.";
        readonly unknown: "No reliable server acknowledgement. The outcome is unknown, not rejected or known to be unexecuted.";
        readonly ended: "Local waiting has ended. The server outcome is unknown, not rejected or known to be unexecuted.";
        readonly retry: "Retry the same submission";
        readonly dismiss: "Dismiss local notice";
    };
};
export declare function CreatorConsentSessionObserver({ sessionId, controller }: {
    sessionId: SessionId;
    controller: CreatorConsentController;
}): ReactNode;
export interface CreatorConsentViewProps {
    snapshot: CreatorConsentSnapshot;
    controller: CreatorConsentController;
    locale?: 'en' | 'zh';
}
/** Actual controlled view; unknown/ended messages deliberately make no saved/rejected/executed claim. */
export declare function CreatorConsentView({ snapshot, controller, locale }: CreatorConsentViewProps): ReactNode;
export declare function CreatorConsentCard({ pending, controller, locale }: {
    pending: PendingCreatorConsent;
    controller: CreatorConsentController;
    locale?: 'en' | 'zh';
}): ReactNode;
/** Direct public service reads only; no mixed Context.sessions access or Remote listener. */
export declare const CREATOR_CONSENT_TRANSPORT_INJECT: readonly ["uiSession", "slots"];
export declare function registerCreatorConsentTransport(ctx: Context, transport: CreatorConsentTransport, options?: Omit<CreatorConsentControllerOptions, 'transport' | 'publish'> & {
    locale?: 'en' | 'zh';
}): CreatorConsentController;
//# sourceMappingURL=creator-consent-transport.d.ts.map