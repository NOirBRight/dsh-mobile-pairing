import type { GatewayEndpoint } from './gateway.ts';
export interface PairingSettingsPageOptions {
    hostIdentity: string;
    endpoint: GatewayEndpoint | null;
    endpointMode?: 'quick' | 'custom';
    customEndpointUrl?: string;
}
/** Self-contained loopback-only Host controls; no runtime CDN or maintainer service. */
export declare function renderPairingSettingsPage(options: PairingSettingsPageOptions): string;
