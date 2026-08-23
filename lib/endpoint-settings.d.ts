import type { GatewayEndpoint } from './gateway.ts';
import { checkCustomEndpoint, checkRelayEndpoint, type CustomEndpointAdapters, type CustomEndpointCheck } from './public-endpoint.ts';
export type EndpointMode = 'quick' | 'custom' | 'relay';
export interface PublicEndpointSelection {
    endpointMode: EndpointMode;
    customEndpointUrl?: string;
    relayUrl?: string;
}
export type PublicEndpointApplyResult = {
    ok: true;
    endpointMode: 'quick';
} | {
    ok: true;
    endpointMode: 'custom';
    endpoint: GatewayEndpoint;
    check: Extract<CustomEndpointCheck, {
        ok: true;
    }>;
} | {
    ok: true;
    endpointMode: 'relay';
    endpoint: GatewayEndpoint;
} | {
    ok: false;
    stage: Exclude<CustomEndpointCheck['stage'], 'ready'> | 'relay';
    error: string;
};
export declare function parseEndpointSelection(value: unknown): PublicEndpointSelection | {
    error: string;
};
export declare function applyPublicEndpointSelection(selection: PublicEndpointSelection, options: {
    hostIdentity: string;
    adapters: CustomEndpointAdapters;
    check?: typeof checkCustomEndpoint;
    relayCheck?: typeof checkRelayEndpoint;
}): Promise<PublicEndpointApplyResult>;
export declare function loadPublicEndpointOverlay(path: string): PublicEndpointSelection | null;
export declare function savePublicEndpointOverlay(path: string, selection: PublicEndpointSelection): void;
