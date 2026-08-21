import { type WebSocket } from 'ws';
export interface GatewayEndpoint {
    url: string;
    kind: 'temporary' | 'custom';
}
export interface GatewayAsset {
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
}
export interface HostGatewayOptions {
    bind: '127.0.0.1' | '::1' | 'localhost';
    port: number;
    hostIdentity: string;
    /** Optional static files. HTML product shells are never served; the APK is the only client. */
    shellAsset?(path: string): GatewayAsset | null;
    /** Host-side authorization lookup; no token material crosses this interface. */
    isPersistentRoom?: (room: string) => boolean;
    onSignal(socket: WebSocket, room: string): void;
    onTunnel(socket: WebSocket, room: string): void;
}
export interface HostGateway {
    port(): number | null;
    listen(): Promise<number>;
    close(): Promise<void>;
    authorizeRoom(room: string, expiresAtMs?: number): void;
}
export declare function createHostGateway(options: HostGatewayOptions): HostGateway;
