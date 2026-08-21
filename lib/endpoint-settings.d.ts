import type { GatewayEndpoint } from './gateway.ts';
import { checkCustomEndpoint, type CustomEndpointAdapters, type CustomEndpointCheck } from './public-endpoint.ts';
export type EndpointMode = 'quick' | 'custom';
export interface PublicEndpointSelection {
    endpointMode: EndpointMode;
    customEndpointUrl?: string;
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
    ok: false;
    stage: Exclude<CustomEndpointCheck['stage'], 'ready'> | 'identity';
    error: string;
};
export declare function parseEndpointSelection(value: unknown): PublicEndpointSelection | {
    error: string;
};
export declare function applyPublicEndpointSelection(selection: PublicEndpointSelection, options: {
    hostIdentity: string;
    adapters: CustomEndpointAdapters;
    check?: typeof checkCustomEndpoint;
}): Promise<PublicEndpointApplyResult>;
export declare function loadPublicEndpointOverlay(path: string): PublicEndpointSelection | null;
export declare function savePublicEndpointOverlay(path: string, selection: PublicEndpointSelection): void;
