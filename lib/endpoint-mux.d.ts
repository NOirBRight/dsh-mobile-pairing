export interface EndpointMuxOptions {
    bind: '127.0.0.1' | '::1' | 'localhost';
    port: number;
    backends: number[] | (() => number[]);
}
export interface EndpointMux {
    port(): number | null;
    listen(): Promise<number>;
    close(): Promise<void>;
}
export declare function createEndpointMux(options: EndpointMuxOptions): EndpointMux;
