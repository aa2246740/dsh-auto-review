/** Deterministic, provider-free first pass for approval review. */
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ReviewDecision } from './reviewer.ts';
/** Match only catastrophic machine-wide operations, not ordinary exact-target cleanup. */
export declare function catastrophicReason(exec: Pick<ToolExecution, 'name' | 'arguments'>): string | undefined;
/**
 * Return a decision only when it is safe without model judgment. Undefined
 * means the OAuth reviewer must compare the call with the user's request.
 */
export declare function deterministicDecision(exec: ToolExecution): ReviewDecision | undefined;
//# sourceMappingURL=policy.d.ts.map