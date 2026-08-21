/** Loopback-only pairing-free mobile preview on the live DSH web port. */
import { type IncomingMessage, type ServerResponse } from 'node:http';
export declare const LOCAL_MOBILE_PATH = "/mobile";
export declare const LOCAL_BOOT_PATH = "/__dsh_boot";
export declare const MOBILE_LAYOUT_PATH = "/plugins/@dsh-mobile/ui-layout-mobile/client.js";
export declare const HOST_BRIDGE_HEADER = "x-dsh-host-bridge";
export interface LocalPreviewOptions {
    shellRoot: string;
    dshHost: string;
    dshPort: number;
}
/** Rewrite packaged shell HTML so its absolute assets stay under /mobile. */
export declare function rewritePreviewHtml(html: string, base?: string): string;
/** Map a /mobile request onto a file inside the packaged browser shell. */
export declare function previewAssetRelPath(requestPath: string, base?: string): string | null;
export declare function readPreviewAsset(root: string, relPath: string): {
    body: Buffer;
    contentType: string;
} | null;
/** Serve the packaged shell under /mobile without pairing. */
export declare function handleLocalMobilePreview(req: IncomingMessage, res: ServerResponse, shellRoot: string): void;
/** Serve the packaged mobile layout that same-origin boot injects into the roster. */
export declare function handleLocalMobileLayout(req: IncomingMessage, res: ServerResponse, shellRoot: string): void;
/** Copy the live DSH index and mark it as a same-origin Host bridge. */
export declare function handleLocalBootManifest(req: IncomingMessage, res: ServerResponse, options: Pick<LocalPreviewOptions, 'dshHost' | 'dshPort'>): void;
