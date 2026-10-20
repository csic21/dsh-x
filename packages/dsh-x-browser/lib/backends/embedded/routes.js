/** Routes are admitted by the official authenticated connection service, then capability-bound here. */
export function createBrowserRoute(method, handler, fields) {
    const endpoint = `browser/${method}`;
    return { path: `/api/${endpoint}`, methods: ['POST'], requestBody: 'buffered', async fetch(request) {
            if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
                return new Response(null, { status: 415 });
            if (Number(request.headers.get('content-length')) > 80 * 1024)
                return new Response(null, { status: 413 });
            let message;
            try {
                const raw = await request.text();
                if (Buffer.byteLength(raw) > 80 * 1024)
                    return new Response(null, { status: 413 });
                message = JSON.parse(raw);
                if (!message || Object.keys(message).sort().join(',') !== 'method,payload,rpcId,type' || message.type !== 'client-request' || message.method !== endpoint || typeof message.rpcId !== 'string' || message.rpcId.length > 128 || !message.payload || Object.getPrototypeOf(message.payload) !== Object.prototype || Object.keys(message.payload).some(key => !fields.includes(key)))
                    throw new Error();
            }
            catch {
                return new Response(null, { status: 400 });
            }
            let result;
            try {
                result = { ok: true, value: await handler(message.payload) };
            }
            catch (error) {
                const failure = error;
                result = { ok: false, error: { code: failure.code ?? 'BROWSER_UNAVAILABLE', message: String(failure.message ?? 'Browser unavailable.').slice(0, 500), details: {} } };
            }
            return Response.json({ type: 'server-response', rpcId: message.rpcId, result });
        } };
}
