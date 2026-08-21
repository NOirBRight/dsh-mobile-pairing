/** Lifecycle owner for one Cloudflare Quick Tunnel child process. */
import type { Readable } from 'node:stream';
export type QuickTunnelStatus = {
    state: 'starting';
} | {
    state: 'ready';
    endpoint: string;
} | {
    state: 'rotated';
    endpoint: string;
    previousEndpoint: string;
} | {
    state: 'error';
    error: string;
} | {
    state: 'stopped';
};
export interface QuickTunnelChild {
    stdout: Readable | null;
    stderr: Readable | null;
    once(event: 'error', listener: (error: Error) => void): unknown;
    once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
    kill(signal?: NodeJS.Signals): boolean;
}
export interface QuickTunnelProvider {
    command: string;
    args(localGateway: string): string[];
    endpointPattern?: RegExp;
}
export declare const CLOUDFLARED_QUICK_PROVIDER: QuickTunnelProvider;
export interface QuickTunnelOptions {
    spawn(command: string, args: string[]): QuickTunnelChild;
    onStatus(status: QuickTunnelStatus): void;
    /** When set, an unexpected child exit starts another process against the same local Gateway. */
    restartOnUnexpectedExit?: boolean;
    /** Command that yields an HTTPS+WSS URL. Defaults to cloudflared. */
    provider?: QuickTunnelProvider;
}
export declare class QuickTunnelController {
    private child;
    private currentEndpoint;
    private currentLocal;
    private stopping;
    private readonly options;
    private onStatus;
    constructor(options: QuickTunnelOptions);
    endpoint(): string | null;
    localGateway(): string | null;
    alive(): boolean;
    start(localGateway: string): void;
    /** Keep the child process; used when the pairing plugin reloads. */
    detach(): void;
    /** Bind a new apply's status listener after detach/reuse. */
    reattach(onStatus: QuickTunnelOptions['onStatus']): void;
    stop(): Promise<void>;
    private spawnChild;
}
