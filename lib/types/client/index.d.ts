import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ReactNode } from 'react';
import type { ApprovalSettings } from '../contracts.ts';
import { type ApprovalTranslate } from './i18n.ts';
export declare const name = "dsh-approve-for-me-client";
export declare const inject: string[];
interface RouteOption {
    value: string;
    label: string;
}
/** Public settings slots only. The card expands the same panel because no general settings-navigation face is public. */
export declare function apply(ctx: ClientContext): void;
export declare function ReviewSettings({ scope, loadCatalog, t, section }: {
    scope: ConfigForm<ApprovalSettings>;
    loadCatalog: () => Promise<RouteOption[]>;
    t: ApprovalTranslate;
    section: 'basic' | 'advanced';
}): ReactNode;
export {};
//# sourceMappingURL=index.d.ts.map