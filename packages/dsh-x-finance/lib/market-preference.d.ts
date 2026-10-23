import type { MarketPreference, MarketProvider } from './market.ts';
export interface MarketPreferenceStore {
    load(): Promise<boolean>;
    save(enabled: boolean): Promise<void>;
}
export declare function createProfileMarketPreference(profileDirectory: unknown): MarketPreferenceStore;
export interface MarketController {
    getProvider(): Promise<MarketProvider | undefined>;
    state(): Promise<MarketPreference>;
    setEnabled(enabled: boolean): Promise<MarketPreference>;
}
export declare function createMarketController(options: {
    forced: boolean;
    store: MarketPreferenceStore;
    createProvider: () => MarketProvider;
}): MarketController;
