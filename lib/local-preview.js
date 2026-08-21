/** Loopback-only pairing-free mobile preview on the live DSH web port. */
import { request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';
export const LOCAL_MOBILE_PATH = '/mobile';
export const LOCAL_BOOT_PATH = '/__dsh_boot';
export const MOBILE_LAYOUT_PATH = '/plugins/@dsh-mobile/ui-layout-mobile/client.js';
export const HOST_BRIDGE_HEADER = 'x-dsh-host-bridge';
const PREVIEW_BOOT_SCRIPT = [
    '<script>window.__DSH_MOBILE_PREVIEW__=1;(function(){',
    'var w=390;',
    'try{Object.defineProperty(window,"innerWidth",{get:function(){return w}})}catch(e){}',
    'if(window.visualViewport){try{Object.defineProperty(window.visualViewport,"width",{get:function(){return w}})}catch(e){}}',
    'var orig=window.matchMedia.bind(window);',
    'window.matchMedia=function(q){if(String(q).indexOf("695px")>=0)return{matches:true,media:q,addEventListener:function(){},removeEventListener:function(){},addListener:function(){},removeListener:function(){},dispatchEvent:function(){return false},onchange:null};return orig(q)};',
    '})()</script>',
].join('');
/** Rewrite packaged shell HTML so its absolute assets stay under /mobile. */
export function rewritePreviewHtml(html, base = LOCAL_MOBILE_PATH) {
    const withBase = html.replaceAll('href="/', `href="${base}/`).replaceAll('src="/', `src="${base}/`);
    return withBase.includes(PREVIEW_BOOT_SCRIPT)
        ? withBase
        : withBase.replace('<head>', `<head>${PREVIEW_BOOT_SCRIPT}`);
}
/** Map a /mobile request onto a file inside the packaged browser shell. */
export function previewAssetRelPath(requestPath, base = LOCAL_MOBILE_PATH) {
    if (requestPath === base || requestPath === `${base}/`)
        return 'index.html';
    const prefix = `${base}/`;
    if (!requestPath.startsWith(prefix))
        return null;
    const rel = requestPath.slice(prefix.length);
    if (rel === '' || rel.includes('..') || rel.includes('://') || rel.includes(String.fromCharCode(92)))
        return null;
    return rel;
}
export function readPreviewAsset(root, relPath) {
    const path = normalize(join(root, relPath));
    const rel = relative(root, path);
    if (rel.startsWith('..') || rel === '')
        return null;
    try {
        return { body: readFileSync(path), contentType: previewContentType(path) };
    }
    catch {
        return null;
    }
}
function previewContentType(path) {
    if (path.endsWith('.html'))
        return 'text/html; charset=utf-8';
    if (path.endsWith('.js'))
        return 'text/javascript; charset=utf-8';
    if (path.endsWith('.css'))
        return 'text/css; charset=utf-8';
    if (path.endsWith('.svg'))
        return 'image/svg+xml';
    if (path.endsWith('.json') || path.endsWith('.webmanifest'))
        return 'application/manifest+json';
    if (path.endsWith('.woff2'))
        return 'font/woff2';
    if (path.endsWith('.woff'))
        return 'font/woff';
    if (path.endsWith('.ttf'))
        return 'font/ttf';
    return 'application/octet-stream';
}
/** Serve the packaged shell under /mobile without pairing. */
export function handleLocalMobilePreview(req, res, shellRoot) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end();
        return;
    }
    const pathname = new URL(req.url ?? '/', 'http://loopback').pathname;
    const rel = previewAssetRelPath(pathname);
    if (rel === null) {
        res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
    }
    const asset = readPreviewAsset(shellRoot, rel);
    if (asset === null) {
        res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
    }
    const body = rel === 'index.html' ? Buffer.from(rewritePreviewHtml(asset.body.toString('utf8'))) : asset.body;
    res.writeHead(200, {
        'content-type': asset.contentType,
        'cache-control': rel === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
}
/** Serve the packaged mobile layout that same-origin boot injects into the roster. */
export function handleLocalMobileLayout(req, res, shellRoot) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end();
        return;
    }
    const asset = readPreviewAsset(shellRoot, 'plugins/@dsh-mobile/ui-layout-mobile/client.js');
    if (asset === null) {
        res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
    }
    res.writeHead(200, {
        'content-type': asset.contentType,
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : asset.body);
}
/** Copy the live DSH index and mark it as a same-origin Host bridge. */
export function handleLocalBootManifest(req, res, options) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        res.end();
        return;
    }
    const upstream = httpRequest({
        host: options.dshHost,
        port: options.dshPort,
        method: 'GET',
        path: '/',
        headers: { host: `${options.dshHost}:${options.dshPort}` },
        timeout: 10_000,
        agent: false,
    }, up => {
        const chunks = [];
        up.on('data', chunk => { chunks.push(chunk); });
        up.on('end', () => {
            if (res.headersSent)
                return;
            const status = up.statusCode ?? 502;
            res.writeHead(status, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
                [HOST_BRIDGE_HEADER]: '1',
                'x-content-type-options': 'nosniff',
            });
            res.end(req.method === 'HEAD' ? undefined : Buffer.concat(chunks));
        });
        up.on('error', () => {
            if (!res.headersSent) {
                res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
                res.end(JSON.stringify({ error: 'DSH boot origin unavailable' }));
            }
        });
    });
    upstream.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify({ error: 'DSH boot origin unavailable' }));
        }
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.end();
}
