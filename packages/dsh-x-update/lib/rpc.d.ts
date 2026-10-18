import type { UpdateService } from './service.ts';
export declare const STATUS_ENDPOINT = "dsh-x-update/status";
export declare const CHECK_ENDPOINT = "dsh-x-update/check";
export declare const STAGE_ENDPOINT = "dsh-x-update/stage";
/** Owner-only update routes behind the official shared Connection admission bridge. */
export declare function createUpdateRoutes(service: UpdateService): {
    path: string;
    methods: string[];
    requestBody: 'buffered';
    fetch(request: Request): Promise<Response>;
}[];
