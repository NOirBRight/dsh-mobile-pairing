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
    hostIdentities: string[];
    capabilities: PublicEndpointCapabilities;
} | {
    ok: false;
    stage: 'endpoint' | 'tls' | 'identity' | 'protocol' | 'capabilities' | 'websocket';
    error: string;
};
export declare function validateCustomEndpoint(value: string): string;
/** Validate an opaque Relay WSS base; the Relay never represents a Host identity. */
export declare function validateRelayEndpoint(value: string): string;
export type RelayEndpointCheck = {
    ok: true;
    stage: 'ready';
} | {
    ok: false;
    stage: 'endpoint' | 'relay';
    error: string;
};
/** Probe a Relay health endpoint without treating it as a Host Gateway. */
export declare function checkRelayEndpoint(value: string, adapters: CustomEndpointAdapters): Promise<RelayEndpointCheck>;
export declare function checkCustomEndpoint(value: string, adapters: CustomEndpointAdapters): Promise<CustomEndpointCheck>;
/** Production adapters for Host-side Custom Endpoint checks. Tests inject their own. */
export declare function createNodeCustomEndpointAdapters(timeoutMs?: number): CustomEndpointAdapters;
