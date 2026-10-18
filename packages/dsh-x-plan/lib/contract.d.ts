export declare function parseContract(text: any): {
    version: number;
    goal: any;
    files: any[];
    steps: any;
    questions: any;
    checks: any;
};
export declare function requireReadyContract(contract: any): any;
export declare function pathInContract(cwd: any, file: any, contract: any): boolean;
