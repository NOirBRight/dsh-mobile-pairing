export interface MuxCliOptions {
    bind: '127.0.0.1' | '::1' | 'localhost';
    port: number;
    backends: number[];
    backendHomes: string[];
}
export declare function parseMuxCliOptions(env: NodeJS.ProcessEnv): MuxCliOptions;
/** Merge static ports with ports published by each DSH Home. */
export declare function resolveMuxBackends(options: Pick<MuxCliOptions, 'backends' | 'backendHomes'>): number[];
