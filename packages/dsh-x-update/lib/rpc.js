export const STATUS_ENDPOINT = 'dsh-x-update/status';
export const CHECK_ENDPOINT = 'dsh-x-update/check';
export const STAGE_ENDPOINT = 'dsh-x-update/stage';
function route(endpoint, handle) {
    return {
        path: `/api/${endpoint}`,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
            if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json')
                return new Response(null, { status: 415 });
            if (Number(request.headers.get('content-length')) > 8192)
                return new Response(null, { status: 413 });
            let message;
            try {
                const text = await request.text();
                if (text.length > 8192)
                    return new Response(null, { status: 413 });
                const parsed = JSON.parse(text);
                if (!parsed || typeof parsed !== 'object')
                    throw new Error();
                message = parsed;
                if (Object.keys(message).sort().join(',') !== 'method,payload,rpcId,type')
                    throw new Error();
                if (message.type !== 'client-request' || typeof message.rpcId !== 'string' || message.rpcId.length > 128 || message.method !== endpoint)
                    throw new Error();
                if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload) || Object.keys(message.payload).length !== 0)
                    throw new Error();
            }
            catch {
                return new Response(null, { status: 400 });
            }
            const value = await handle(message.payload, request.signal);
            return Response.json({ type: 'server-response', rpcId: message.rpcId, result: value });
        },
    };
}
/** Owner-only update routes behind the official shared Connection admission bridge. */
export function createUpdateRoutes(service) {
    return [
        route(STATUS_ENDPOINT, () => ({ ok: true, value: service.snapshot() })),
        route(CHECK_ENDPOINT, () => {
            void service.check();
            return { ok: true, value: service.snapshot() };
        }),
        route(STAGE_ENDPOINT, () => {
            void service.stage();
            return { ok: true, value: service.snapshot() };
        }),
    ];
}
