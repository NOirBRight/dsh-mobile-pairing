/**
 * Plugin config: the schemastery schema validates raw cordis.yml values at load
 * (fail loud), then {@link resolveConfig} owns derivation as an explicit
 * resolve step — no hidden `?? default` inside run paths.
 */
import { join } from 'node:path';
import { homedir, hostname, userInfo } from 'node:os';
import z from '@deepseek-ai/schemastery';
export const Config = z.object({
    hostName: z.string(),
    appUrl: z.string().default('dsh-mobile://pair'),
    advertiseUrl: z.string(),
    bind: z.string().default('0.0.0.0'),
    port: z.natural().max(65535).default(0),
    dshHost: z.string().default('127.0.0.1'),
    dshPort: z.natural().min(1).max(65535).default(3080),
    dshHome: z.string().default(process.env.DSH_HOME ?? join(homedir(), '.dsh')),
    keyStorePath: z.string(),
    tokenStorePath: z.string(),
    codeTtlMs: z.natural().default(300_000),
    cookieRetryDelayMs: z.natural().min(1).max(60_000).default(3_000),
    endpointMode: z.string().default('quick'),
    customEndpointUrl: z.string(),
    relayUrl: z.string(),
    gatewayBind: z.string().default('127.0.0.1'),
    gatewayPort: z.natural().max(65535).default(0),
    cloudflaredPath: z.string().default('cloudflared'),
    quickTunnelCommand: z.string(),
    quickTunnelArgs: z.array(z.string()).default(['tunnel', '--url', '{gateway}', '--no-autoupdate']),
    quickTunnelEndpointPattern: z.string(),
    signalingUrl: z.string(),
    stunUrls: z.array(z.string()).default(['stun:stun.cloudflare.com:3478']),
    enableDirect: z.boolean().default(true),
});
/** Keep the machine name while removing a login-name prefix such as user-AM01S. */
export function deviceHostName(systemHostname, username) {
    const cleanHost = systemHostname.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    const cleanUser = username.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (cleanHost === '' || cleanUser === '')
        return cleanHost;
    const lowerHost = cleanHost.toLocaleLowerCase();
    const lowerUser = cleanUser.toLocaleLowerCase();
    for (const separator of ['-', '_', '.']) {
        const prefix = lowerUser + separator;
        if (lowerHost.startsWith(prefix) && cleanHost.length > prefix.length)
            return cleanHost.slice(prefix.length);
    }
    return cleanHost;
}
/**
 * Derive the remaining defaults and enforce the checks the schema cannot
 * express. Throws on any invalid value — misconfiguration fails loud at load.
 * @param config - schema-parsed config.
 * @returns config with every field concrete.
 */
export function resolveConfig(config) {
    // DSH does not currently expose its user-chosen profile name to plugins. An
    // explicit hostName therefore wins; otherwise keep instances on the same
    // machine distinguishable by putting the configured upstream port first.
    let username = '';
    try {
        username = userInfo().username;
    }
    catch { /* unavailable user metadata leaves the hostname intact */ }
    if (!Number.isInteger(config.dshPort) || config.dshPort < 1 || config.dshPort > 65535) {
        throw new Error('dsh-mobile-pairing: dshPort must be an integer from 1 through 65535');
    }
    const fallbackHostName = `${config.dshPort} · ${deviceHostName(hostname(), username)}`;
    const hostName = (config.hostName ?? fallbackHostName).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64);
    if (hostName === '')
        throw new Error('dsh-mobile-pairing: hostName must not be empty');
    if (config.advertiseUrl !== undefined && !/^(https?|wss?):\/\//.test(config.advertiseUrl)) {
        throw new Error(`dsh-mobile-pairing: advertiseUrl must be an http(s)/ws(s) URL, got "${config.advertiseUrl}"`);
    }
    if (!/^(https?:\/\/|dsh-mobile:\/\/pair(?:$|[?#]))/.test(config.appUrl)) {
        throw new Error(`dsh-mobile-pairing: appUrl must be an http(s) URL or dsh-mobile://pair, got "${config.appUrl}"`);
    }
    if (config.endpointMode !== 'quick' && config.endpointMode !== 'custom' && config.endpointMode !== 'relay')
        throw new Error('dsh-mobile-pairing: endpointMode must be quick, custom, or relay');
    if (!['127.0.0.1', '::1', 'localhost'].includes(config.gatewayBind))
        throw new Error('dsh-mobile-pairing: gatewayBind must be loopback');
    if (config.endpointMode === 'custom') {
        if (config.customEndpointUrl === undefined)
            throw new Error('dsh-mobile-pairing: customEndpointUrl is required in custom mode');
        let endpoint;
        try {
            endpoint = new URL(config.customEndpointUrl);
        }
        catch {
            throw new Error('dsh-mobile-pairing: customEndpointUrl must be HTTPS');
        }
        if (endpoint.protocol !== 'https:')
            throw new Error('dsh-mobile-pairing: customEndpointUrl must be HTTPS');
        if (endpoint.username !== '' || endpoint.password !== '')
            throw new Error('dsh-mobile-pairing: customEndpointUrl must not contain credentials');
    }
    if (config.endpointMode === 'relay') {
        if (config.relayUrl === undefined)
            throw new Error('dsh-mobile-pairing: relayUrl is required in relay mode');
        let relay;
        try {
            relay = new URL(config.relayUrl);
        }
        catch {
            throw new Error('dsh-mobile-pairing: relayUrl must be WSS');
        }
        if (relay.protocol !== 'wss:')
            throw new Error('dsh-mobile-pairing: relayUrl must be WSS');
        if (relay.username !== '' || relay.password !== '' || relay.search !== '' || relay.hash !== '')
            throw new Error('dsh-mobile-pairing: relayUrl must not contain credentials, query, or fragment data');
    }
    if (config.signalingUrl !== undefined && !/^wss?:\/\//.test(config.signalingUrl)) {
        throw new Error(`dsh-mobile-pairing: signalingUrl must be a ws(s) URL, got "${config.signalingUrl}"`);
    }
    if (config.dshHost !== '127.0.0.1' && config.dshHost !== '::1' && config.dshHost !== 'localhost') {
        throw new Error('dsh-mobile-pairing: dshHost must be loopback');
    }
    if (config.stunUrls.some(url => !/^stuns?:(\/\/)?/i.test(url))) {
        throw new Error('dsh-mobile-pairing: stunUrls must contain STUN-only URLs; TURN is never accepted');
    }
    if (config.codeTtlMs <= 0) {
        throw new Error('dsh-mobile-pairing: codeTtlMs must be positive');
    }
    if (config.quickTunnelEndpointPattern !== undefined) {
        try {
            void new RegExp(config.quickTunnelEndpointPattern, 'ig');
        }
        catch {
            throw new Error('dsh-mobile-pairing: quickTunnelEndpointPattern must be a valid regular expression');
        }
    }
    return {
        ...config,
        hostName,
        keyStorePath: config.keyStorePath ?? join(config.dshHome, 'mobile', 'daemon-keypair.json'),
        tokenStorePath: config.tokenStorePath ?? join(config.dshHome, 'mobile', 'devices.json'),
    };
}
