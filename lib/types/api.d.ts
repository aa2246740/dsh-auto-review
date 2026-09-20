/** Authenticated, same-origin settings/history API on the public Connection carrier. */
import type { Context } from '@deepseek-ai/cordis';
import { ApprovalAuditStore } from './audit.ts';
/** This handler must only be installed via Connection.fetch, never bare WebServer routes. */
export declare function approvalApiResponse(store: ApprovalAuditStore, request: Request): Promise<Response>;
/** Public Connection owns authentication, Host/Origin checks, body limits and disposal. */
export declare function installApprovalApi(ctx: Context, store: ApprovalAuditStore): void;
//# sourceMappingURL=api.d.ts.map