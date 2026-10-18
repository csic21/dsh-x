export declare const BROWSER_TOOLS: readonly ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            tabId?: undefined;
            epoch?: undefined;
            grantRevision?: undefined;
            action?: undefined;
            url?: undefined;
            target?: undefined;
            text?: undefined;
            x?: undefined;
            y?: undefined;
            key?: undefined;
        };
        additionalProperties: boolean;
        required?: undefined;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        additionalProperties: boolean;
        required: string[];
        properties: {
            tabId: {
                type: string;
            };
            epoch: {
                type: string;
            };
            grantRevision: {
                type: string;
            };
            action: {
                type: string;
                enum: string[];
            };
            url: {
                type: string;
            };
            target: {
                type: string;
            };
            text: {
                type: string;
            };
            x: {
                type: string;
            };
            y: {
                type: string;
            };
            key: {
                type: string;
            };
        };
    };
})[];
/** One owned native process, one ephemeral capability; never a global MCP setting. */
export declare function createBrowserMcp({ invoke, signal, isActive }: any): Promise<{
    config: {
        type: string;
        url: string;
        headers: {
            Authorization: string;
        };
        oauth: boolean;
        timeout: number;
    };
    close(): Promise<void>;
}>;
