/** Path of the single-line port file under a DSH Home. */
export declare function gatewayPortPath(dshHome: string): string;
/** Write the listened Gateway port; empty/invalid ports are ignored. */
export declare function writeGatewayPort(dshHome: string, port: number): void;
/** Read a previously published Gateway port, or null when missing/invalid. */
export declare function readGatewayPort(dshHome: string): number | null;
/** Drop the published port when this Gateway unbinds. */
export declare function clearGatewayPort(dshHome: string): void;
