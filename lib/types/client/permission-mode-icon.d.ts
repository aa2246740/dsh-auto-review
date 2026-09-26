export declare const APPROVE_FOR_ME_LABEL = "Approve for me";
export declare const APPROVE_FOR_ME_SHIELD_PATH = "M8.20554 0.899994L14.7901 3.36857V7.01026C14.7901 12 11.0466 14.2103 8.20554 15.3C5.36446 14.2103 1.62012 12 1.62012 7.01026V3.36857L8.20554 0.899994Z";
export declare const APPROVE_FOR_ME_SPARK_PATH = "M8.205 3.86C8.397 5.283 9.327 6.213 10.75 6.405C9.327 6.597 8.397 7.527 8.205 8.95C8.013 7.527 7.083 6.597 5.66 6.405C7.083 6.213 8.013 5.283 8.205 3.86Z";
/**
 * Fail closed: the composer permission menu is the one that lists this
 * plugin's preset next to DSH's three official rows. Official labels are
 * locale-specific; 0.1.7-rc.2 ships English and Simplified Chinese.
 */
export declare function isPermissionPresetMenu(labels: readonly string[]): boolean;
/**
 * Add the plugin-owned glyph without patching DSH core. Official PermissionSelect
 * only maps icons for built-in preset ids; host-configured rows stay icon-less
 * until this decorator runs. The popup exists only while open, so a bounded
 * observer reapplies after React mounts or replaces the row.
 */
export declare function installApproveForMeIcon(root?: Document): () => void;
//# sourceMappingURL=permission-mode-icon.d.ts.map