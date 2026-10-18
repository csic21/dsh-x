/** Known official read-only tools. Unknown capabilities fail closed during a task. */
export declare const READ_ONLY_DURING_DRAFT: Set<string>;
export declare const PLAN_TOOLS: Set<string>;
export declare function gateDecision({ toolName, draft, workflow, locked }: any): {
    kind: string;
    reason?: undefined;
} | {
    kind: string;
    reason: string;
};
