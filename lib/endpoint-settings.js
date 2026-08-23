/** Validate, check, and persist Host Public Endpoint mode without editing YAML. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { checkCustomEndpoint, checkRelayEndpoint, validateCustomEndpoint, validateRelayEndpoint } from "./public-endpoint.js";
export function parseEndpointSelection(value) {
    if (typeof value !== 'object' || value === null)
        return { error: 'endpoint selection must be an object' };
    const record = value;
    if (record.endpointMode === 'quick') {
        return { endpointMode: 'quick', ...(typeof record.customEndpointUrl === 'string' && record.customEndpointUrl !== '' ? { customEndpointUrl: record.customEndpointUrl } : {}) };
    }
    if (record.endpointMode === 'custom') {
        if (typeof record.customEndpointUrl !== 'string' || record.customEndpointUrl.trim() === '')
            return { error: 'customEndpointUrl is required in custom mode' };
        return { endpointMode: 'custom', customEndpointUrl: record.customEndpointUrl.trim() };
    }
    if (record.endpointMode === 'relay') {
        if (typeof record.relayUrl !== 'string' || record.relayUrl.trim() === '')
            return { error: 'relayUrl is required in relay mode' };
        return { endpointMode: 'relay', relayUrl: record.relayUrl.trim() };
    }
    return { error: 'endpointMode must be quick, custom, or relay' };
}
export async function applyPublicEndpointSelection(selection, options) {
    if (selection.endpointMode === 'quick')
        return { ok: true, endpointMode: 'quick' };
    if (selection.endpointMode === 'relay') {
        let relayUrl;
        try {
            relayUrl = validateRelayEndpoint(selection.relayUrl);
        }
        catch (error) {
            return { ok: false, stage: 'endpoint', error: error.message };
        }
        const check = await (options.relayCheck ?? checkRelayEndpoint)(relayUrl, options.adapters);
        if (!check.ok)
            return check;
        return { ok: true, endpointMode: 'relay', endpoint: { url: relayUrl, kind: 'relay' } };
    }
    const check = await (options.check ?? checkCustomEndpoint)(selection.customEndpointUrl, options.adapters);
    if (!check.ok)
        return check;
    const known = new Set([check.hostIdentity, ...check.hostIdentities]);
    if (!known.has(options.hostIdentity)) {
        return { ok: false, stage: 'identity', error: 'endpoint Host Identity does not match this Host' };
    }
    return { ok: true, endpointMode: 'custom', endpoint: { url: validateCustomEndpoint(selection.customEndpointUrl), kind: 'custom' }, check };
}
export function loadPublicEndpointOverlay(path) {
    let raw;
    try {
        raw = readFileSync(path, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return null;
        throw new Error('dsh-mobile-pairing: unreadable public endpoint overlay ' + path + ': ' + String(error));
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error('dsh-mobile-pairing: unreadable public endpoint overlay ' + path + ': ' + String(error));
    }
    const selection = parseEndpointSelection(parsed);
    if ('error' in selection)
        throw new Error('dsh-mobile-pairing: invalid public endpoint overlay ' + path + ': ' + selection.error);
    return selection;
}
export function savePublicEndpointOverlay(path, selection) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = path + '.' + process.pid + '.tmp';
    writeFileSync(tmp, JSON.stringify(selection, null, 2));
    renameSync(tmp, path);
}
