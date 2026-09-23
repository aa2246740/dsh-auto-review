import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ApprovalApiCommand, ApprovalDashboard, ApprovalRule, ApprovalSettings, ReviewRecord, ReviewStatus, RuleMatch } from '../contracts.ts';
export declare const DEFAULT_RULE_HOURS = 8;
export declare const MAX_RULE_HOURS: number;
export declare const REVIEW_STATUSES: readonly ReviewStatus[];
export interface HistoryFilter {
    sessionId: string;
    status: string;
    toolName: string;
}
export declare const EMPTY_FILTER: HistoryFilter;
export type NumericSetting = {
    key: keyof ApprovalSettings;
    min: number;
    max: number;
    fallback: number;
    scale?: number;
};
export declare const NUMERIC_SETTINGS: readonly NumericSetting[];
/** A resolved settings promise can mean recovery after rejection; read back the public mirror. */
export declare function persistSettings(scope: ConfigForm<ApprovalSettings>, values: Partial<ApprovalSettings>): Promise<boolean>;
/** Empty, fractional, exponential and non-finite drafts never become settings writes. */
export declare function parseIntegerDraft(text: string, min: number, max: number): number | undefined;
export declare function dashboardUrl(filter?: HistoryFilter, before?: number): string;
export declare class ApprovalApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
/** No Host RPC, token access, cross-origin credentials or private route inference. */
export declare function getDashboard(filter: HistoryFilter, before?: number, signal?: AbortSignal): Promise<ApprovalDashboard>;
export declare function postCommand(command: ApprovalApiCommand): Promise<{
    ok: true;
    revision?: number;
} | RuleMatch>;
/** Records have no mode discriminator: require both advertised modes, never guess the active session. */
export declare function canSaveAutomatic(dashboard: ApprovalDashboard | undefined): boolean;
export declare function canUseCreatorPlugin(value: Pick<ApprovalRule, 'stage' | 'toolName' | 'pluginId'>): boolean;
/** Fingerprints belong only to exact scope. Keep the source digest in the local draft, never in a plugin-scope payload. */
export declare function withRuleScope(rule: ApprovalRule, scope: ApprovalRule['scope'], sourceFingerprint?: string): ApprovalRule;
export declare function ruleFromRecord(record: ReviewRecord, name: string, now?: number, id?: `${string}-${string}-${string}-${string}-${string}`): ApprovalRule;
export type RuleProblem = 'ruleNameRequired' | 'ruleBindingRequired' | 'ruleFingerprintRequired' | 'rulePluginRequired' | 'ruleExpiryInvalid' | 'autoBlocked';
export declare function ruleProblem(rule: ApprovalRule, automatic: boolean, forSave?: boolean, now?: number): RuleProblem | undefined;
/** A deliberate field whitelist: never spread a record or export fingerprints/raw payloads. */
export declare function redactedHistoryExport(records: readonly ReviewRecord[]): string;
//# sourceMappingURL=settings-helpers.d.ts.map