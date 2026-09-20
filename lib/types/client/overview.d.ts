import type { ReactNode } from 'react';
import type { ApprovalDashboard } from '../contracts.ts';
import type { ApprovalTranslate } from './i18n.ts';
/** Secondary explanations stay discoverable without competing with the controls. */
export declare function HelpDisclosure({ title, children }: {
    title: string;
    children: ReactNode;
}): ReactNode;
export declare function Overview({ dashboard, t, children, onHistory }: {
    dashboard: ApprovalDashboard;
    t: ApprovalTranslate;
    children: ReactNode;
    onHistory: () => void;
}): ReactNode;
//# sourceMappingURL=overview.d.ts.map