export declare function isBrowserChild(exec: any, tickets: any): boolean;
/** Authority is a real ToolRuntime parent Symbol, never a model argument. */
export declare function bindNativeBrowser({ exec, runId, signal, assertCurrent, ownership, execute, tickets }: any): {
    invoke(name: any, args: any, requestSignal?: any): Promise<any>;
    close(): void;
};
