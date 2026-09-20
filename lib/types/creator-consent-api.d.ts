/** Authenticated same-origin confirmation and remembered-grant routing. Not a capability mint. */
import type { Context } from '@deepseek-ai/cordis';
import { CREATOR_CONSENT_API_PATH } from './contracts.ts';
import { CreatorAuthorizerHost } from './creator-authorizer-host.ts';
export { CREATOR_CONSENT_API_PATH };
export declare function creatorConsentApiResponse(host: CreatorAuthorizerHost, request: Request): Promise<Response>;
export declare function installCreatorConsentApi(ctx: Context, host: CreatorAuthorizerHost): void;
//# sourceMappingURL=creator-consent-api.d.ts.map