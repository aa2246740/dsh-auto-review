/** Race even non-cooperative providers/answerers; a late result can never become a grant. */
export declare function abortable<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T>;
//# sourceMappingURL=abort.d.ts.map