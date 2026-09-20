import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { ReviewSubject } from './reviewer.ts';
import type { ApprovalDashboard, ApprovalRule, ApprovalSettings, ReviewRecord } from './contracts.ts';
export interface HistoryFilter {
    limit?: number;
    before?: number;
    sessionId?: string;
    status?: string;
    toolName?: string;
}
export interface ReviewAuditPort {
    begin(subject: ReviewSubject, exec?: ToolExecution): ReviewRecord | undefined;
    update(id: string, patch: Partial<ReviewRecord>): boolean;
    toolResult(exec: Readonly<ToolExecution>, result?: Readonly<ToolExecutionResult>): void;
}
export declare const CAPABILITIES: ApprovalDashboard['capabilities'];
/** One Host-owned store. Corrupt/unwritable stores disable new automatic grants, not the Host. */
export declare class ApprovalAuditStore implements ReviewAuditPort {
    private readonly directory;
    private readonly settings;
    readonly path: string;
    private state;
    private error;
    private disposed;
    private readonly executions;
    constructor(directory: string, settings: () => ApprovalSettings);
    private limits;
    private commit;
    begin(subject: ReviewSubject, exec?: ToolExecution): ReviewRecord | undefined;
    update(id: string, patch: Partial<ReviewRecord>): boolean;
    toolResult(exec: Readonly<ToolExecution>, result?: Readonly<ToolExecutionResult>): void;
    dashboard(filter?: HistoryFilter): ApprovalDashboard;
    rules(): ApprovalRule[];
    record(id: string): ReviewRecord | undefined;
    private ruleChange;
    saveRule(value: unknown, expectedRevision: number): number;
    deleteRule(id: string, expectedRevision: number): number;
    clearHistory(expectedRevision: number): number;
    private checkRevision;
    dispose(): void;
}
//# sourceMappingURL=audit.d.ts.map