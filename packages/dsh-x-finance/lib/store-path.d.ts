export declare const STORE_DIRECTORY = ".dsh-x-finance";
/** Pre-rename directory; only ever renamed, never read directly. */
export declare const PREVIOUS_STORE_DIRECTORY = ".dsh-x-stock";
/**
 * Returns the profile-scoped store directory, adopting the pre-rename one the
 * first time it is called. A concurrent host start that loses the race simply
 * keeps the directory the winner created.
 */
export declare function profileStoreDirectory(profileDirectory: string): Promise<string>;
