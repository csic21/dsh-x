/** Concrete ownership registry the composition root wires into the tool surface. */
export type BrowserOwnership = ReturnType<typeof createBrowserOwnership>;
/** Native owner registration offered by an approved OpenCode parent execution. */
export type BrowserOwnerBinding = {
    runtime?: string;
    nativeRunId?: unknown;
    signal?: AbortSignal;
};
/** In-process lifetime record for one native parent execution; `close` is attached before it enters the registry. */
export type BrowserOwner = {
    ownerToken: symbol;
    runtime: string;
    nativeRunId: unknown;
    signal: AbortSignal;
    assertCurrent(): void;
    close?: () => void;
};
/** In-process lifetime metadata only. No browser executor or renderer capability crosses this boundary. */
export declare function createBrowserOwnership({ onClose }: {
    onClose: (token: symbol) => void;
}): {
    bind: (parentToken: unknown, { runtime, nativeRunId, signal }?: BrowserOwnerBinding) => () => void;
    resolve(parentToken: unknown): BrowserOwner | null;
    dispose(): void;
};
