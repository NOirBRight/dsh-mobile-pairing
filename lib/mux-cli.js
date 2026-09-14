/** Standalone Public Endpoint mux: one loopback origin in front of several Host Gateways. */
import { pathToFileURL } from 'node:url';
import { createEndpointMux } from "./endpoint-mux.js";
import { readGatewayPort } from "./gateway-port.js";
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
export function parseMuxCliOptions(env) {
    const bind = env.DSH_PAIR_MUX_BIND ?? '127.0.0.1';
    if (!LOOPBACK.has(bind))
        throw new Error('DSH_PAIR_MUX_BIND must be loopback');
    const port = Number(env.DSH_PAIR_MUX_PORT ?? '0');
    if (!Number.isInteger(port) || port < 0 || port > 65535)
        throw new Error('DSH_PAIR_MUX_PORT must be an integer 0-65535');
    const backends = (env.DSH_PAIR_MUX_BACKENDS ?? '')
        .split(',')
        .map(part => Number(part.trim()))
        .filter(value => Number.isInteger(value) && value > 0 && value <= 65535);
    const backendHomes = (env.DSH_PAIR_MUX_BACKEND_HOMES ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(value => value !== '');
    if (backends.length === 0 && backendHomes.length === 0) {
        throw new Error('DSH_PAIR_MUX_BACKENDS or DSH_PAIR_MUX_BACKEND_HOMES must name this Host\'s Gateway');
    }
    return { bind: bind, port, backends, backendHomes };
}
/** Merge static ports with ports published by each DSH Home. */
export function resolveMuxBackends(options) {
    const ports = [...options.backends];
    for (const home of options.backendHomes) {
        const published = readGatewayPort(home);
        if (published !== null && !ports.includes(published))
            ports.push(published);
    }
    return ports;
}
async function main() {
    const options = parseMuxCliOptions(process.env);
    const mux = createEndpointMux({
        bind: options.bind,
        port: options.port,
        backends: () => resolveMuxBackends(options),
    });
    const listened = await mux.listen();
    console.log('dsh-pair-mux listening on ' + options.bind + ':' + listened + ' backends ' + resolveMuxBackends(options).join(','));
    const stop = () => {
        void mux.close().then(() => process.exit(0));
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
}
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
    void main().catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
