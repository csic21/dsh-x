import path from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createAtlasRoute, createPetPageRoute, createPetRoute } from './routes.js';
import { petFramePage } from './frame.js';
import { createShell, frameURL } from './native.js';
import { playbackFor, readFrameFacts } from './frame-state.js';
import { DEFAULT_PET_ID, PET_OFF, createPetStore } from './store.js';
export const name = 'dsh-x-pet';
export const inject = ['tools', 'profileContext'];
const PET_LIST = 'dsh-x-pet/list';
const PET_SELECT = 'dsh-x-pet/select';
const PET_MOVE = 'dsh-x-pet/move';
const PET_ATLAS = 'dsh-x-pet/atlas';
const PET_ACTIVITY = 'dsh-x-pet/activity';
/** The detached window's document and the facts it polls. */
const PET_FRAME = 'dsh-x-pet/frame';
const PET_STATE = 'dsh-x-pet/state';
/** Start or stop the native shell window. */
const PET_WINDOW = 'dsh-x-pet/window';
/**
 * Read the tail of a session log and name the step it is on. A tool whose
 * result has not been written yet is still running; anything else is the model
 * thinking. Unknown or unreadable logs degrade to the generic phase.
 */
export function readActivity(session) {
    try {
        const last = Number(session.seq ?? 0);
        const events = session.snapshotEvents(Math.max(0, last - 48));
        const record = (value) => typeof value === 'object' && value !== null ? value : undefined;
        let call = null;
        let resultSeq = -1;
        for (let index = events.length - 1; index >= 0; index -= 1) {
            const event = events[index];
            if (event.type === 'tool/result') {
                resultSeq = Number(event.seq ?? -1);
                break;
            }
            if (event.type === 'tool/call') {
                call = { seq: Number(event.seq ?? -1), data: record(event.data) };
                break;
            }
        }
        const stepOf = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
        if (call && call.seq > resultSeq) {
            const name = call.data?.name;
            return { phase: 'tool', tool: typeof name === 'string' ? name.slice(0, 64) : null, step: stepOf(call.data?.step) };
        }
        const tail = events[events.length - 1];
        const thinking = tail?.type === 'assistant/attempt' || tail?.type === 'step/start' || tail?.type === 'tool/result';
        return { phase: thinking ? 'thinking' : 'working', tool: null, step: stepOf(record(tail?.data)?.step) };
    }
    catch {
        return { phase: 'working', tool: null, step: null };
    }
}
/** The package directory, so the bundled atlas resolves wherever the plugin is installed. */
const packageDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundledDirectory = path.join(packageDirectory, 'assets', 'default-pet');
const INSTALLED_APPS = [
    '/Applications/ChatGPT.app/Contents/Resources/app.asar',
    '/Applications/Codex.app/Contents/Resources/app.asar',
];
function codexAsar(config) {
    if (typeof config.codexApp === 'string') {
        if (config.codexApp.length === 0)
            return undefined;
        const file = path.resolve(config.codexApp);
        return existsSync(file) ? file : undefined;
    }
    return INSTALLED_APPS.find(file => existsSync(file));
}
function codexRoot(config) {
    if (typeof config.codexHome === 'string') {
        return config.codexHome.length === 0 ? undefined : path.resolve(config.codexHome);
    }
    const fromEnvironment = process.env.CODEX_HOME;
    return path.join(fromEnvironment && path.isAbsolute(fromEnvironment) ? fromEnvironment : path.join(homedir(), '.codex'));
}
export function apply(ctx, config = {}) {
    const services = ctx;
    const root = codexRoot(config);
    const store = createPetStore({
        profileDirectory: services.profileContext.dir,
        bundledDirectory,
        codexHome: root,
        codexAsar: codexAsar(config),
    });
    const view = async () => {
        const [pets, selection] = await Promise.all([store.list(), store.selection()]);
        return {
            pets,
            selection,
            // A selection that no longer exists falls back to the bundled pet, so a
            // deleted local folder never leaves the frame empty.
            active: selection.active === PET_OFF ? PET_OFF : pets.some(pet => pet.id === selection.active) ? selection.active : (pets[0]?.id ?? DEFAULT_PET_ID),
            source: root ?? null,
        };
    };
    ctx.tools.register(defineTool({
        name: 'dsh_x_pet',
        description: 'List, choose, move or hide the desktop pet shown in the Harness frame. The pet is the Codex pet: it reads the same sprite atlas and the same local pets from ~/.codex/pets, and its animation follows the session state (idle, running, waiting for approval, failed, review). This tool changes presentation only; it cannot act on files, approvals or sessions.',
        parameters: {
            action: { type: 'string', required: true, enum: ['list', 'select', 'hide', 'move'], description: 'list returns every available pet; select makes one pet active; hide removes it from the frame; move sets its resting offset in pixels.' },
            id: { type: 'string', description: 'Pet id for select, exactly as list returned it.' },
            x: { type: 'number', description: 'Horizontal offset in CSS pixels from the frame bottom-right corner (negative moves left).' },
            y: { type: 'number', description: 'Vertical offset in CSS pixels from the frame bottom (positive moves down, negative moves up).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    pets: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: true,
                            properties: {
                                id: { type: 'string', required: true },
                                displayName: { type: 'string', required: true },
                                description: { type: 'string', required: true },
                                source: { type: 'string', required: true, enum: ['bundled', 'local', 'codex'] },
                                rows: { type: 'integer', required: true },
                            },
                        },
                    },
                    active: { type: 'string', required: true },
                    source: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        async execute(args) {
            switch (args.action) {
                case 'list': return await view();
                case 'select': {
                    if (typeof args.id !== 'string')
                        throw new Error('select needs a pet id from list.');
                    await store.select(args.id);
                    return await view();
                }
                case 'hide': {
                    await store.select(PET_OFF);
                    return await view();
                }
                case 'move': {
                    if (!Number.isFinite(args.x) || !Number.isFinite(args.y))
                        throw new Error('move needs numeric x and y offsets.');
                    await store.move({ x: args.x, y: args.y });
                    return await view();
                }
                default: throw new Error('Unknown action; use list, select, hide or move.');
            }
        },
    }));
    ctx.inject(['connection', 'sessions', 'webApp'], injected => {
        const host = injected;
        const shell = createShell();
        host.effect(() => () => shell.close());
        host.connection.fetch.register(createPetRoute(PET_ACTIVITY, async (payload) => {
            const ids = payload.ids;
            if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== 'string' || id.length === 0 || id.length > 128)) {
                throw new Error('PET_ACTIVITY');
            }
            const activities = {};
            for (const id of ids) {
                const session = host.sessions.get(id);
                if (session)
                    activities[id] = readActivity(session);
            }
            return { activities };
        }, ['ids']));
        host.connection.fetch.register(createPetRoute(PET_LIST, async () => await view(), []));
        host.connection.fetch.register(createPetRoute(PET_SELECT, async (payload) => {
            const id = payload.id;
            if (typeof id !== 'string' || id.length === 0 || id.length > 128)
                throw new Error('PET_UNKNOWN');
            await store.select(id);
            return await view();
        }, ['id']));
        host.connection.fetch.register(createPetRoute(PET_MOVE, async (payload) => {
            const { x, y } = payload;
            if (!Number.isFinite(x) || !Number.isFinite(y))
                throw new Error('PET_POSITION');
            await store.move({ x: x, y: y });
            return await view();
        }, ['x', 'y']));
        host.connection.fetch.register(createAtlasRoute(PET_ATLAS, async (id) => {
            const { entry, bytes } = await store.atlas(id);
            return { bytes, mime: entry.mime };
        }));
        // The detached window cannot see the Client store, so it reads one folded
        // snapshot from the Host: the pet is the same, the data path is not.
        host.connection.fetch.register(createPetRoute(PET_STATE, async () => {
            const current = await view();
            const active = current.active;
            const rows = current.pets.find(pet => pet.id === active)?.rows ?? 11;
            const facts = readFrameFacts(host.sessions.list(), Date.now());
            return { active, rows, facts, playback: playbackFor(facts.state) };
        }, []));
        host.connection.fetch.register(createPetPageRoute(PET_FRAME, petFramePage));
        // The pet's own window: compiled from the shipped Swift source on first use.
        host.connection.fetch.register(createPetRoute(PET_WINDOW, async (payload) => {
            if (payload.action === 'close') {
                shell.close();
                return { open: false };
            }
            if (payload.action !== 'open')
                throw new Error('PET_WINDOW');
            const base = host.webApp.getAdvertisedUrl();
            const opened = await shell.open({
                profileDir: host.profileContext.dir,
                source: path.join(packageDirectory, 'native', 'pet-window.swift'),
                frameURL: frameURL(base),
                bootstrapURL: host.connection.authenticatedUrl(base),
            });
            if (!opened)
                throw new Error('PET_NATIVE_UNAVAILABLE');
            return { open: true };
        }, ['action']));
    });
}
export { PET_ACTIVITY, PET_ATLAS, PET_FRAME, PET_LIST, PET_MOVE, PET_SELECT, PET_STATE, PET_WINDOW };
