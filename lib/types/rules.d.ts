/** Pure, fail-closed rule validation and matching. No tool execution or source discovery. */
import type { ApprovalRule, RuleContext, RuleMatch } from './contracts.ts';
/** Return a detached, validated rule; SHA-256 hex is canonicalized to lowercase. */
export declare function validateRule(value: unknown): ApprovalRule;
/**
 * Never infers sourceVerified from a tool name. Callers own execution-bound
 * provenance; unsupported public bindings MUST pass false. Policy denial also
 * returns action:'deny' when matched:false, and must not be discarded by callers.
 */
export declare function matchRules(rules: readonly ApprovalRule[], context: RuleContext): RuleMatch;
//# sourceMappingURL=rules.d.ts.map