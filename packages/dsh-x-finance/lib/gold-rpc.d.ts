import type { GoldProvider } from './gold-provider.ts';
export type GoldProviderSource = GoldProvider | (() => Promise<GoldProvider | undefined>);
export declare function createGoldHandler({ provider, now }?: {
    provider?: GoldProviderSource;
    now?: () => number;
}): (endpoint: any, payload: any, signal: any, peer: any) => Promise<{
    ok: boolean;
    error: {
        code: string;
        message: string;
        details: {};
    };
} | {
    ok: boolean;
    value: {
        status: string;
        snapshot?: undefined;
    };
} | {
    ok: boolean;
    value: {
        status: string;
        snapshot: import("./gold.ts").GoldSnapshot;
    };
}>;
export declare function createGoldRoute(options?: {
    provider?: GoldProviderSource;
    now?: () => number;
}): {
    path: string;
    methods: string[];
    requestBody: string;
    fetch(request: any): Promise<Response>;
};
