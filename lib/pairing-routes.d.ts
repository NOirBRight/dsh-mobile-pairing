import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionFetchRoute, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { WebRoute, WebServer } from '@deepseek-ai/dsh-host-webserver';
export type PairingAdminRoute = Pick<WebRoute, 'path' | 'handler'>;
/** Connection.fetch registers the full absolute path, including its authenticated `/api` carrier. */
export declare const REMOTE_SETTINGS_ROUTES: {
    readonly status: "/api/dsh-mobile/remote/status";
    readonly devices: "/api/dsh-mobile/remote/devices";
    readonly endpoint: "/api/dsh-mobile/remote/endpoint";
    readonly revoke: "/api/dsh-mobile/remote/revoke";
    readonly label: "/api/dsh-mobile/remote/label";
    readonly pair: "/api/dsh-mobile/remote/pair";
};
/** Register remote aliases behind Connection's authenticated /api carrier. */
export declare function registerAuthenticatedPairRoutes(ctx: Context, webServer: WebServer, connection: HostConnectionHandle, fetchRoutes: readonly ConnectionFetchRoute[], adminRoutes: readonly PairingAdminRoute[]): void;
