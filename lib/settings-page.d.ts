import type { GatewayEndpoint } from './gateway.ts';
export interface PairingSettingsPageOptions {
    hostIdentity: string;
    endpoint: GatewayEndpoint | null;
    endpointMode?: 'quick' | 'custom' | 'relay';
    endpointState?: 'loading' | 'ready' | 'error';
    endpointError?: string | null;
    customEndpointUrl?: string;
    relayUrl?: string;
}
/** Self-contained loopback-only Host controls; no runtime CDN or maintainer service. */
export declare function renderPairingSettingsPage(options: PairingSettingsPageOptions): string;
