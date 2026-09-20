/** Hash the complete arguments, not the redacted preview or a caller-supplied digest. */
export declare function argumentFingerprint(value: unknown): string;
/** Bounded metadata only: neither file bodies nor full shell/JS programs enter audit storage. */
export declare function summarizeArguments(value: unknown): string;
/** Metadata hint only; never a provenance or authorization assertion. */
export declare function targetPlugin(toolName: string, args: unknown): string | undefined;
/** Remove inline credentials and URL credentials from bounded explanations. */
export declare function auditText(value: string, limit?: number): string;
//# sourceMappingURL=approval-context.d.ts.map