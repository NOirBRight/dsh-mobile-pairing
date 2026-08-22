import z from '@deepseek-ai/schemastery';
/** Plugin config as parsed from cordis.yml (defaults already applied). */
export interface Config {
    /** Human-facing Host Display Name; never endpoint or Room identity. */
    hostName: string;
    /** Base URL the QR points the phone at (the mobile shell PWA, M2+). */
    appUrl: string;
    /** Advertised `addr` override; unset derives http://<first LAN IPv4>:<proxy port> per request. */
    advertiseUrl?: string;
    /** Auth-proxy bind host. */
    bind: string;
    /** Auth-proxy bind port; 0 asks the OS, the listened value is logged at startup. */
    port: number;
    /** Upstream dsh web host. The proxy only ever forwards to loopback. */
    dshHost: string;
    /** Upstream dsh web port. */
    dshPort: number;
    /** Harness home; the keypair and device store live under it unless overridden. */
    dshHome: string;
    /** Daemon Curve25519 keypair file; unset derives <dshHome>/mobile/daemon-keypair.json. */
    keyStorePath?: string;
    /** Device token store file; unset derives <dshHome>/mobile/devices.json. */
    tokenStorePath?: string;
    /** One-time pairing-code lifetime in milliseconds. */
    codeTtlMs: number;
    /** Product Public Endpoint mode. Quick Tunnel is the zero-configuration default. */
    endpointMode: 'quick' | 'custom';
    /** Operator-provisioned URL, required only in custom mode. */
    customEndpointUrl?: string;
    /** Standalone Host Gateway is always loopback-bound. */
    gatewayBind: '127.0.0.1' | '::1' | 'localhost';
    /** Standalone Host Gateway listen port; 0 asks the OS. */
    gatewayPort: number;
    /** Optional Quick Tunnel executable; defaults to cloudflaredPath. */
    quickTunnelCommand?: string;
    /** Optional argv template; `{gateway}` is replaced with the loopback Gateway URL. */
    quickTunnelArgs?: string[];
    /** Optional regex source that extracts the HTTPS endpoint from Quick Tunnel logs. */
    quickTunnelEndpointPattern?: string;
    /** cloudflared executable used in quick mode. */
    cloudflaredPath: string;
    /** Legacy outbound signaling URL; never a product default. */
    signalingUrl?: string;
    /** Public STUN discovery URLs. TURN/TURNS are rejected. */
    stunUrls: string[];
    /** Legacy flag retained for config compatibility; product /pair mints v4 Public Endpoint offers. */
    enableDirect: boolean;
}
export declare const Config: z<Config>;
/** The config after the resolve step: every derivable field is concrete and checked. */
export interface ResolvedConfig extends Config {
    keyStorePath: string;
    tokenStorePath: string;
}
/**
 * Derive the remaining defaults and enforce the checks the schema cannot
 * express. Throws on any invalid value — misconfiguration fails loud at load.
 * @param config - schema-parsed config.
 * @returns config with every field concrete.
 */
export declare function resolveConfig(config: Config): ResolvedConfig;
