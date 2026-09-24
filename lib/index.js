import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { renderPairingQrSvg } from "./qr.js";
import { compactDisplayName } from '@dsh-mobile/e2e-tunnel';
import { resolveConfig } from "./config.js";
import { loadOrCreateKeypair } from "./keys.js";
import { DeviceTokenStore } from "./tokens.js";
import { PairingOfferManager, buildCompactPublicOfferUrl, buildOfferUrl } from "./pairing.js";
import { attachHandshakeTransport, attachRelaySocket } from "./tunnel-server.js";
import { bindConnectionCookie } from "./connection-lifecycle.js";
import { formatLoopbackAuthority } from "./dsh-cookie.js";
import { allowDshRuntime } from "./compatibility.js";
import { createRelayConnector } from "./relay-connector.js";
import { shouldKeepPendingRelaySeat, shouldReuseRelayCampaign } from "./relay-campaign.js";
import { clearGatewayPort, writeGatewayPort } from "./gateway-port.js";
import { attachDirectSignaling } from "./direct-signaling.js";
import { WeriftDataChannelTransport } from "./webrtc-transport.js";
import { createHostGateway } from "./gateway.js";
import { QuickTunnelController } from "./quick-tunnel.js";
import { validateCustomEndpoint, validateRelayEndpoint, createNodeCustomEndpointAdapters } from "./public-endpoint.js";
import { applyPublicEndpointSelection, loadPublicEndpointOverlay, parseEndpointSelection, savePublicEndpointOverlay } from "./endpoint-settings.js";
import { renderPairingSettingsPage } from "./settings-page.js";
import { registerAuthenticatedPairRoutes, REMOTE_SETTINGS_ROUTES } from "./pairing-routes.js";
export const name = 'dsh-mobile-pairing';
export const inject = ['webServer'];
export { Config, resolveConfig } from "./config.js";
export { loadOrCreateKeypair } from "./keys.js";
export { DeviceTokenStore, DeviceLimitError, MAX_LIVE_DEVICES } from "./tokens.js";
export { PairingOfferManager, buildCompactPublicOfferUrl, buildOfferUrl, parseOfferUrl } from "./pairing.js";
export { createAuthProxy, WS_AUTH_PREFIX } from "./proxy.js";
export { hostHandshake } from "./handshake.js";
/** Legacy compatibility export only; product runtime never instantiates it. */
export { createRelayConnector } from "./relay-connector.js";
export { clearGatewayPort, gatewayPortPath, readGatewayPort, writeGatewayPort } from "./gateway-port.js";
export { attachHandshakeTransport, attachRelaySocket } from "./tunnel-server.js";
export { attachDirectSignaling, encodeSignalDescription } from "./direct-signaling.js";
export { WeriftDataChannelTransport } from "./webrtc-transport.js";
export { createHostGateway } from "./gateway.js";
export { createEndpointMux } from "./endpoint-mux.js";
export { QuickTunnelController, CLOUDFLARED_QUICK_PROVIDER } from "./quick-tunnel.js";
export { checkCustomEndpoint, checkRelayEndpoint, createNodeCustomEndpointAdapters, validateCustomEndpoint, validateRelayEndpoint } from "./public-endpoint.js";
export { applyPublicEndpointSelection, loadPublicEndpointOverlay, parseEndpointSelection, savePublicEndpointOverlay } from "./endpoint-settings.js";
export { renderPairingSettingsPage } from "./settings-page.js";
export function apply(ctx, config) {
    if (!allowDshRuntime(ctx.logger, 'dsh-mobile-pairing', ['@deepseek-ai/dsh-host-webserver']))
        return;
    const webServer = ctx.webServer;
    const resolved = resolveConfig(config);
    const displayName = compactDisplayName(resolved.hostName, 'Host');
    const overlayPath = join(resolved.dshHome, 'mobile', 'public-endpoint.json');
    const overlay = loadPublicEndpointOverlay(overlayPath);
    const live = {
        mode: overlay?.endpointMode ?? resolved.endpointMode,
        customUrl: overlay?.customEndpointUrl ?? resolved.customEndpointUrl,
        relayUrl: overlay?.relayUrl ?? resolved.relayUrl,
    };
    const keypair = loadOrCreateKeypair(resolved.keyStorePath);
    const store = new DeviceTokenStore(resolved.tokenStorePath);
    const offers = new PairingOfferManager(resolved.codeTtlMs);
    let endpoint = live.mode === 'custom'
        ? { url: validateCustomEndpoint(live.customUrl), kind: 'custom' }
        : live.mode === 'relay' && live.relayUrl !== undefined
            ? { url: validateRelayEndpoint(live.relayUrl), kind: 'relay' }
            : null;
    let endpointState = endpoint === null ? 'loading' : 'ready';
    let endpointError = null;
    let localGateway = null;
    const relayCampaigns = new Map();
    const closeCampaign = (room) => {
        const campaign = relayCampaigns.get(room);
        if (campaign === undefined)
            return;
        relayCampaigns.delete(room);
        try {
            campaign.connector.close();
        }
        finally {
            try {
                campaign.gate?.close();
            }
            catch {
                // Gate close can throw after the socket is already gone; retry is already stopped.
            }
        }
    };
    const roomGates = new Map();
    function trackRoomGate(room, socket, gate) {
        const gates = roomGates.get(room) ?? new Set();
        roomGates.set(room, gates);
        let active = true;
        const release = () => {
            if (!active)
                return;
            active = false;
            gates.delete(tracked);
            if (gates.size === 0 && roomGates.get(room) === gates)
                roomGates.delete(room);
        };
        const tracked = {
            close: () => {
                if (!active)
                    return;
                release();
                try {
                    gate.close();
                }
                catch (error) {
                    ctx.logger.error(error instanceof Error ? error : new Error(String(error)));
                }
            },
        };
        gates.add(tracked);
        // Closing the carrier must also close an attached WebRTC peer/session.
        socket.once('close', tracked.close);
    }
    function closeRoomGates(room) {
        const gates = roomGates.get(room);
        if (gates === undefined)
            return;
        for (const gate of [...gates])
            gate.close();
    }
    function closeAllRoomGates() {
        for (const room of [...roomGates.keys()])
            closeRoomGates(room);
    }
    function closeGatewayRoom(room) {
        closeRoomGates(room);
        // Expire the temporary authorization already minted for this room. The
        // persistent-room predicate is checked only after this entry is removed.
        if (/^[0-9a-f]{32}$/.test(room))
            gateway.authorizeRoom(room, Date.now() - 1);
    }
    // Alpha.4 requires the loopback browser-session cookie on every upstream
    // request/WebSocket; acquired via the Connection launch token. Read live
    // from the current connection so already-open Relay campaigns pick it up.
    const dshAuthority = formatLoopbackAuthority(resolved.dshHost, resolved.dshPort);
    const cookieBinding = bindConnectionCookie(ctx, 'http://' + dshAuthority + '/', dshAuthority, resolved.cookieRetryDelayMs);
    function followDeviceRoom(previousRoom, room) {
        if (previousRoom !== undefined && previousRoom !== room && !store.hasLiveForRoom(previousRoom)) {
            closeCampaign(previousRoom);
            closeGatewayRoom(previousRoom);
        }
        if (live.mode === 'relay')
            ensureRelayRoom(room, '');
        else
            gateway.authorizeRoom(room);
    }
    function tunnelOptions(room) {
        return {
            upstreamHost: resolved.dshHost,
            upstreamPort: resolved.dshPort,
            upstreamCookie: () => cookieBinding.current()?.cookie,
            handshake: { keypair, offers, devices: store, room, hostName: displayName, onRoomFollow: followDeviceRoom },
            logger: (message) => ctx.logger.info('dsh-mobile-pairing: ' + message),
            onUnauthorized: cookieBinding.refresh,
            waitCookie: cookieBinding.waitCookie,
        };
    }
    function ensureRelayRoom(room, code) {
        if (live.mode !== 'relay' || live.relayUrl === undefined)
            return;
        const previous = relayCampaigns.get(room);
        if (code === '' && shouldReuseRelayCampaign(previous, live.relayUrl))
            return;
        if (previous !== undefined)
            closeCampaign(room);
        const relayUrl = live.relayUrl;
        const campaign = {
            relayUrl,
            code,
            connector: createRelayConnector({
                relayUrl,
                room,
                shouldRetry: () => store.hasLiveForRoom(room) || offers.validate(code) === 'ok',
                onSocket: socket => {
                    if (relayCampaigns.get(room) !== campaign) {
                        socket.close();
                        return;
                    }
                    const previous = campaign.gate;
                    campaign.gate = attachRelaySocket(socket, tunnelOptions(room));
                    try {
                        previous?.close();
                    }
                    catch {
                        // Replaced gate; the new socket already owns the room.
                    }
                },
                logger: message => ctx.logger.info('dsh-mobile-pairing: ' + message),
            }),
        };
        relayCampaigns.set(room, campaign);
    }
    function closeRelayRooms() {
        for (const room of [...relayCampaigns.keys()])
            closeCampaign(room);
    }
    function restartRelayRooms() {
        if (live.mode !== 'relay' || live.relayUrl === undefined) {
            closeRelayRooms();
            return;
        }
        const rooms = new Set(store.liveRooms());
        for (const room of [...relayCampaigns.keys()]) {
            const campaign = relayCampaigns.get(room);
            const pending = shouldKeepPendingRelaySeat(campaign, campaign === undefined ? 'unknown' : offers.validate(campaign.code));
            if (!rooms.has(room) && !pending)
                closeCampaign(room);
        }
        for (const room of rooms)
            ensureRelayRoom(room, '');
    }
    ctx.effect(() => () => closeRelayRooms());
    const gateway = createHostGateway({
        bind: resolved.gatewayBind, port: resolved.gatewayPort, hostIdentity: keypair.publicKeyBase64Url,
        isPersistentRoom: room => store.hasLiveForRoom(room),
        onSignal: (socket, room) => {
            let tunnelGate = null;
            const signalGate = attachDirectSignaling(socket, {
                iceServers: resolved.stunUrls.map(url => ({ urls: url })),
                onChannel: channel => {
                    tunnelGate?.close();
                    tunnelGate = attachHandshakeTransport(new WeriftDataChannelTransport(channel), tunnelOptions(room));
                },
                onError: error => ctx.logger.error(error),
            });
            trackRoomGate(room, socket, {
                close: () => {
                    tunnelGate?.close();
                    tunnelGate = null;
                    signalGate.close();
                },
            });
        },
        onTunnel: (socket, room) => { trackRoomGate(room, socket, attachRelaySocket(socket, tunnelOptions(room))); },
    });
    if (live.mode === 'relay') {
        for (const room of store.liveRooms())
            ensureRelayRoom(room, '');
    }
    else {
        for (const room of store.liveRooms())
            gateway.authorizeRoom(room);
    }
    let quick = null;
    function onQuickStatus(status) {
        if (status.state === 'starting') {
            endpoint = null;
            endpointState = 'loading';
            endpointError = null;
        }
        if (status.state === 'ready' || status.state === 'rotated') {
            endpoint = { url: status.endpoint, kind: 'temporary' };
            endpointState = 'ready';
            endpointError = null;
        }
        if (status.state === 'error') {
            endpoint = null;
            endpointState = 'error';
            endpointError = status.error;
        }
        if (status.state === 'stopped' && live.mode === 'quick') {
            endpoint = null;
            endpointState = 'loading';
            endpointError = null;
        }
        if (status.state === 'error')
            ctx.logger.error(new Error('dsh-mobile-pairing: ' + status.error));
        else
            ctx.logger.info('dsh-mobile-pairing: Quick Tunnel ' + status.state + ('endpoint' in status ? ' ' + status.endpoint : ''));
    }
    function startQuickTunnel(local) {
        quick = new QuickTunnelController({
            spawn: (command, args) => spawn(command === 'cloudflared' ? resolved.cloudflaredPath : command, args, { stdio: ['ignore', 'pipe', 'pipe'] }),
            provider: {
                command: resolved.quickTunnelCommand ?? 'cloudflared',
                args: local => (resolved.quickTunnelArgs ?? ['tunnel', '--url', '{gateway}', '--no-autoupdate']).map(part => part.replaceAll('{gateway}', local)),
                ...(resolved.quickTunnelEndpointPattern === undefined ? {} : { endpointPattern: new RegExp(resolved.quickTunnelEndpointPattern, 'ig') }),
            },
            restartOnUnexpectedExit: true,
            onStatus: onQuickStatus,
        });
        quick.start(local);
        retainQuickTunnel(quick);
    }
    ctx.effect(() => {
        void gateway.listen().then(port => {
            writeGatewayPort(resolved.dshHome, port);
            const local = 'http://' + formatLoopbackAuthority(resolved.gatewayBind, port);
            ctx.logger.info('dsh-mobile-pairing: bounded Host Gateway on ' + local);
            localGateway = local;
            if (live.mode !== 'quick') {
                void retainQuickTunnel()?.stop();
                retainQuickTunnel(null);
                if (live.mode === 'relay')
                    restartRelayRooms();
                return;
            }
            const retained = retainQuickTunnel();
            if (retained !== null && retained.alive() && retained.localGateway() === local) {
                quick = retained;
                retained.reattach(onQuickStatus);
                const existing = retained.endpoint();
                if (existing !== null) {
                    endpoint = { url: existing, kind: 'temporary' };
                    endpointState = 'ready';
                    endpointError = null;
                }
                ctx.logger.info('dsh-mobile-pairing: Quick Tunnel reused ' + (existing ?? local));
                return;
            }
            void retained?.stop();
            startQuickTunnel(local);
        }, error => ctx.logger.error(error instanceof Error ? error : new Error(String(error))));
        const reseat = setInterval(() => restartRelayRooms(), 15_000);
        reseat.unref();
        return () => {
            clearInterval(reseat);
            closeRelayRooms();
            closeAllRoomGates();
            clearGatewayPort(resolved.dshHome);
            quick?.detach();
            return gateway.close();
        };
    });
    async function handleEndpointSave(req) {
        if (req.method !== 'POST')
            return methodNotAllowedResponse();
        const input = await readJsonBody(req);
        if (!input.ok)
            return input.response;
        const selection = parseEndpointSelection(input.value);
        if ('error' in selection)
            return jsonResponse(400, { ok: false, stage: 'endpoint', error: selection.error });
        const applied = await applyPublicEndpointSelection(selection, { hostIdentity: keypair.publicKeyBase64Url, adapters: createNodeCustomEndpointAdapters() });
        if (!applied.ok)
            return jsonResponse(422, applied);
        savePublicEndpointOverlay(overlayPath, selection);
        live.mode = selection.endpointMode;
        live.customUrl = selection.customEndpointUrl;
        live.relayUrl = selection.relayUrl;
        if (applied.endpointMode === 'custom') {
            closeRelayRooms();
            await quick?.stop();
            quick = null;
            retainQuickTunnel(null);
            endpoint = applied.endpoint;
            endpointState = 'ready';
            endpointError = null;
            for (const room of store.liveRooms())
                gateway.authorizeRoom(room);
        }
        else if (applied.endpointMode === 'relay') {
            await quick?.stop();
            quick = null;
            retainQuickTunnel(null);
            endpoint = applied.endpoint;
            endpointState = 'ready';
            endpointError = null;
            restartRelayRooms();
        }
        else {
            endpoint = null;
            endpointState = 'loading';
            endpointError = null;
            if (localGateway !== null) {
                closeRelayRooms();
                for (const room of store.liveRooms())
                    gateway.authorizeRoom(room);
                if (quick === null || !quick.alive()) {
                    void retainQuickTunnel()?.stop();
                    startQuickTunnel(localGateway);
                }
            }
        }
        return jsonResponse(200, { ok: true, endpoint, endpointMode: live.mode, endpointState, endpointError, customEndpointUrl: live.customUrl ?? null, relayUrl: live.relayUrl ?? null, ...(applied.endpointMode === 'custom' ? { check: applied.check } : {}) });
    }
    async function handleRevoke(req) {
        if (req.method !== 'POST')
            return methodNotAllowedResponse();
        const input = await readJsonBody(req);
        if (!input.ok)
            return input.response;
        const record = input.value;
        const id = record !== null && typeof record === 'object' ? record.id : undefined;
        const room = typeof id === 'string' ? store.list().find(device => device.id === id)?.room : undefined;
        const revoked = typeof id === 'string' && store.revoke(id);
        if (revoked && room !== undefined && !store.hasLiveForRoom(room)) {
            closeCampaign(room);
            closeGatewayRoom(room);
        }
        return jsonResponse(revoked ? 200 : 404, { ok: revoked });
    }
    async function handleLabel(req) {
        if (req.method !== 'POST')
            return methodNotAllowedResponse();
        const input = await readJsonBody(req);
        if (!input.ok)
            return input.response;
        const record = input.value;
        const renamed = record !== null && typeof record === 'object'
            && typeof record.id === 'string' && typeof record.label === 'string'
            && store.rename(record.id, record.label);
        return jsonResponse(renamed ? 200 : 404, { ok: renamed });
    }
    function statusResponse() {
        return jsonResponse(200, { endpoint, endpointMode: live.mode, endpointState, endpointError, customEndpointUrl: live.customUrl ?? null, relayUrl: live.relayUrl ?? null, hostIdentity: keypair.publicKeyBase64Url, configuration: { file: 'cordis.patch.yml', entryId: 'dsh-mobile-pairing', customEndpointField: 'customEndpointUrl', relayEndpointField: 'relayUrl', legacyRelayConfigured: resolved.signalingUrl !== undefined, relayConfigured: live.relayUrl !== undefined } });
    }
    function devicesResponse() {
        return jsonResponse(200, { devices: store.list() });
    }
    function handlePair(req) {
        return handleLocalPair(req, endpoint, keypair.publicKeyBase64Url, resolved.appUrl, displayName, resolved.stunUrls, offers, store, gateway, ensureRelayRoom);
    }
    const fetchRoutes = [
        { path: REMOTE_SETTINGS_ROUTES.status, methods: ['GET'], requestBody: 'buffered', fetch: safeFetch(statusResponse) },
        { path: REMOTE_SETTINGS_ROUTES.devices, methods: ['GET'], requestBody: 'buffered', fetch: safeFetch(devicesResponse) },
        { path: REMOTE_SETTINGS_ROUTES.endpoint, methods: ['POST'], requestBody: 'buffered', fetch: safeFetch(handleEndpointSave) },
        { path: REMOTE_SETTINGS_ROUTES.pair, methods: ['GET'], requestBody: 'buffered', fetch: safeFetch(handlePair) },
        { path: REMOTE_SETTINGS_ROUTES.revoke, methods: ['POST'], requestBody: 'buffered', fetch: safeFetch(handleRevoke) },
        { path: REMOTE_SETTINGS_ROUTES.label, methods: ['POST'], requestBody: 'buffered', fetch: safeFetch(handleLabel) },
    ];
    const adminRoutes = [
        { path: '/pair/ui', handler: webServerHandler(async (req) => req.method === 'GET'
                ? new Response(renderPairingSettingsPage({ hostIdentity: keypair.publicKeyBase64Url, endpoint, endpointMode: live.mode, endpointState, endpointError, customEndpointUrl: live.customUrl, relayUrl: live.relayUrl }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
                : methodNotAllowedResponse()) },
        { path: '/pair/status', handler: webServerHandler(async (req) => req.method === 'GET' ? statusResponse() : methodNotAllowedResponse()) },
        { path: '/pair/endpoint', handler: webServerHandler(handleEndpointSave) },
        { path: '/pair/devices', handler: webServerHandler(async (req) => req.method === 'GET' ? devicesResponse() : methodNotAllowedResponse()) },
        { path: '/pair/revoke', handler: webServerHandler(handleRevoke) },
        { path: '/pair/label', handler: webServerHandler(handleLabel) },
    ];
    ctx.effect(() => {
        const connectionFiber = ctx.inject(['connection', 'webServer'], connectionCtx => {
            registerAuthenticatedPairRoutes(connectionCtx, connectionCtx.webServer, connectionCtx.connection, fetchRoutes, adminRoutes);
        });
        return () => connectionFiber.dispose();
    }, 'dsh-mobile-pairing: authenticated routes');
    ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/pair',
        handler: webServerHandler(handlePair),
    }), 'dsh-mobile-pairing: public pairing route');
}
async function handleLocalPair(req, endpoint, pubkey, appUrl, hostName, stunUrls, offers, store, gateway, ensureRelayRoom) {
    if (req.method !== 'GET')
        return methodNotAllowedResponse();
    if (endpoint === null)
        return jsonResponse(503, { error: 'Public Endpoint is not ready' });
    const url = req instanceof Request ? req.url : req.url ?? '/';
    const params = new URL(url, 'http://loopback').searchParams;
    const requestedRoom = params.get('room');
    if (requestedRoom !== null && !store.hasLiveForRoom(requestedRoom))
        return jsonResponse(404, { error: 'unknown authorized device room' });
    const room = requestedRoom ?? randomBytes(16).toString('hex');
    if (endpoint.kind === 'relay') {
        const offer = offers.mint('relay', endpoint.url, room, pubkey, undefined, hostName);
        ensureRelayRoom(room, offer.code);
        const nativeOfferUrl = buildOfferUrl(appUrl, offer);
        if (params.get('format') === 'svg') {
            const svg = await renderPairingQrSvg(nativeOfferUrl);
            return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
        }
        return jsonResponse(200, { ...offer, offerUrl: nativeOfferUrl, nativeOfferUrl });
    }
    const offer = offers.mintPublic({ endpoint: endpoint.url, endpointKind: endpoint.kind, room, pubkey, hostName, ice: stunUrls });
    gateway.authorizeRoom(room, offer.exp * 1000);
    const nativeOfferUrl = buildOfferUrl(appUrl, offer);
    if (params.get('format') === 'svg') {
        const compactUrl = buildCompactPublicOfferUrl(appUrl, offer);
        const svg = await renderPairingQrSvg(compactUrl);
        return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
    }
    return jsonResponse(200, { ...offer, offerUrl: nativeOfferUrl, nativeOfferUrl });
}
const RETAINED_QUICK = Symbol.for('dsh-mobile.quick-tunnel');
function retainQuickTunnel(controller) {
    const holder = globalThis;
    if (controller === null) {
        delete holder[RETAINED_QUICK];
        return null;
    }
    if (controller !== undefined)
        holder[RETAINED_QUICK] = controller;
    return holder[RETAINED_QUICK] ?? null;
}
function methodNotAllowedResponse() {
    return new Response(null, { status: 405 });
}
function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    if (req instanceof Request) {
        const reader = req.body?.getReader();
        if (reader !== undefined) {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.byteLength;
                    if (size > 64 * 1024) {
                        await reader.cancel().catch(() => { });
                        return { ok: false, response: new Response(null, { status: 413 }) };
                    }
                    chunks.push(value);
                }
            }
            finally {
                reader.releaseLock();
            }
        }
    }
    else {
        for await (const chunk of req) {
            const bytes = chunk;
            size += bytes.byteLength;
            if (size > 64 * 1024)
                return { ok: false, response: new Response(null, { status: 413 }) };
            chunks.push(bytes);
        }
    }
    const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
    try {
        return { ok: true, value: JSON.parse(bytes.toString()) };
    }
    catch {
        return { ok: false, response: jsonResponse(400, { error: 'invalid JSON body' }) };
    }
}
function safeFetch(handler) {
    return async (req) => {
        try {
            return await handler(req);
        }
        catch {
            return jsonResponse(500, { error: 'internal server error' });
        }
    };
}
function webServerHandler(handler) {
    return async (req, res) => {
        let response;
        try {
            response = await handler(req);
        }
        catch {
            response = jsonResponse(500, { error: 'internal server error' });
        }
        const headers = {};
        response.headers.forEach((value, key) => { headers[key] = value; });
        res.writeHead(response.status, headers);
        res.end(Buffer.from(await response.arrayBuffer()));
    };
}
