export declare function parseMuxCliOptions(env: NodeJS.ProcessEnv): {
    bind: '127.0.0.1' | '::1' | 'localhost';
    port: number;
    backends: number[];
};
