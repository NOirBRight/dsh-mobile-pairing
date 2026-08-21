import type { PublicEndpointCapabilities } from './pairing.ts';
export interface EndpointFetchResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}
export interface EndpointWebSocket {
    close(): void;
}
export interface CustomEndpointAdapters {
    fetch(url: string): Promise<EndpointFetchResponse>;
    openWebSocket(url: string): Promise<EndpointWebSocket>;
}
export type CustomEndpointCheck = {
    ok: true;
    stage: 'ready';
    hostIdentity: string;
    capabilities: PublicEndpointCapabilities;
} | {
    ok: false;
    stage: 'endpoint' | 'tls' | 'identity' | 'protocol' | 'capabilities' | 'websocket';
    error: string;
};
export declare function validateCustomEndpoint(value: string): string;
export declare function checkCustomEndpoint(value: string, adapters: CustomEndpointAdapters): Promise<CustomEndpointCheck>;
/** Production adapters for Host-side Custom Endpoint checks. Tests inject their own. */
export declare function createNodeCustomEndpointAdapters(timeoutMs?: number): CustomEndpointAdapters;
