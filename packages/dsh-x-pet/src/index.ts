import path from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createAtlasRoute, createPetRoute } from './routes.ts'
import type { PetRoute } from './routes.ts'
import { DEFAULT_PET_ID, PET_OFF, createPetStore } from './store.ts'
import type { PetStore } from './store.ts'

/** Official host services this plugin consumes, without a shipped type dependency. */
interface PetHostServices {
  profileContext: { dir: string }
  connection: { fetch: { register(route: PetRoute): () => void } }
  /** Official live-session registry; read-only here. */
  sessions: {
    get(id: string): LiveSession | undefined
    list(): readonly LiveSession[]
  }
}

/** The slice of a live Session this plugin reads. */
interface LiveSession {
  readonly id?: string
  seq?: number
  snapshotEvents(from?: number): readonly { type: string, seq?: number, time?: number, data?: unknown }[]
}

export const name = 'dsh-x-pet'
export const inject = ['tools', 'profileContext']

export interface PetConfig {
  /**
   * Directory that holds Codex pets. Defaults to `${CODEX_HOME:-~/.codex}/pets`,
   * the same folder the Codex app reads, so an existing pet shows up unchanged.
   * Set an absolute path to read a different collection; set an empty string to
   * disable local pets and keep only the bundled one.
   */
  codexHome?: string
  /**
   * `app.asar` of the installed Codex or ChatGPT app. Defaults to the copy in
   * `/Applications`. The built-in pets are read from it and are not shipped
   * with this plugin. Set an empty string to skip them.
   */
  codexApp?: string
}

const PET_LIST = 'dsh-x-pet/list'
const PET_SELECT = 'dsh-x-pet/select'
const PET_MOVE = 'dsh-x-pet/move'
const PET_ATLAS = 'dsh-x-pet/atlas'
const PET_ACTIVITY = 'dsh-x-pet/activity'

/** What a running conversation is doing right now, in one short word. */
export interface SessionActivity {
  phase: 'tool' | 'thinking' | 'working'
  /** The tool currently executing, when one is in flight. */
  tool: string | null
  step: number | null
}

/**
 * Read the tail of a session log and name the step it is on. A tool whose
 * result has not been written yet is still running; anything else is the model
 * thinking. Unknown or unreadable logs degrade to the generic phase.
 */
export function readActivity(session: LiveSession): SessionActivity {
  try {
    const last = Number(session.seq ?? 0)
    const events = session.snapshotEvents(Math.max(0, last - 48))
    const record = (value: unknown): Record<string, unknown> | undefined =>
      typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
    let call: { seq: number, data?: Record<string, unknown> } | null = null
    let resultSeq = -1
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event.type === 'tool/result') { resultSeq = Number(event.seq ?? -1); break }
      if (event.type === 'tool/call') { call = { seq: Number(event.seq ?? -1), data: record(event.data) }; break }
    }
    const stepOf = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
    if (call && call.seq > resultSeq) {
      const name = call.data?.name
      return { phase: 'tool', tool: typeof name === 'string' ? name.slice(0, 64) : null, step: stepOf(call.data?.step) }
    }
    const tail = events[events.length - 1]
    const thinking = tail?.type === 'assistant/attempt' || tail?.type === 'step/start' || tail?.type === 'tool/result'
    return { phase: thinking ? 'thinking' : 'working', tool: null, step: stepOf(record(tail?.data)?.step) }
  } catch {
    return { phase: 'working', tool: null, step: null }
  }
}

/** The package directory, so the bundled atlas resolves wherever the plugin is installed. */
const packageDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const bundledDirectory = path.join(packageDirectory, 'assets', 'default-pet')

const INSTALLED_APPS = [
  '/Applications/ChatGPT.app/Contents/Resources/app.asar',
  '/Applications/Codex.app/Contents/Resources/app.asar',
]

function codexAsar(config: PetConfig): string | undefined {
  if (typeof config.codexApp === 'string') {
    if (config.codexApp.length === 0) return undefined
    const file = path.resolve(config.codexApp)
    return existsSync(file) ? file : undefined
  }
  return INSTALLED_APPS.find(file => existsSync(file))
}

function codexRoot(config: PetConfig): string | undefined {
  if (typeof config.codexHome === 'string') {
    return config.codexHome.length === 0 ? undefined : path.resolve(config.codexHome)
  }
  const fromEnvironment = process.env.CODEX_HOME
  return path.join(fromEnvironment && path.isAbsolute(fromEnvironment) ? fromEnvironment : path.join(homedir(), '.codex'))
}

export function apply(ctx: Context, config: PetConfig = {}) {
  const services = ctx as Context & PetHostServices
  const root = codexRoot(config)
  const store: PetStore = createPetStore({
    profileDirectory: services.profileContext.dir,
    bundledDirectory,
    codexHome: root,
    codexAsar: codexAsar(config),
  })

  const view = async () => {
    const [pets, selection] = await Promise.all([store.list(), store.selection()])
    return {
      pets,
      selection,
      // A selection that no longer exists falls back to the bundled pet, so a
      // deleted local folder never leaves the frame empty.
      active: selection.active === PET_OFF ? PET_OFF : pets.some(pet => pet.id === selection.active) ? selection.active : (pets[0]?.id ?? DEFAULT_PET_ID),
      source: root ?? null,
    }
  }

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
      } as const,
      render: (_args, value) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      switch (args.action) {
        case 'list': return await view() as any
        case 'select': {
          if (typeof args.id !== 'string') throw new Error('select needs a pet id from list.')
          await store.select(args.id)
          return await view() as any
        }
        case 'hide': {
          await store.select(PET_OFF)
          return await view() as any
        }
        case 'move': {
          if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) throw new Error('move needs numeric x and y offsets.')
          await store.move({ x: args.x as number, y: args.y as number })
          return await view() as any
        }
        default: throw new Error('Unknown action; use list, select, hide or move.')
      }
    },
  }))

  ctx.inject(['connection', 'sessions'], injected => {
    const host = injected as Context & PetHostServices
    host.connection.fetch.register(createPetRoute(PET_ACTIVITY, async payload => {
      const ids = payload.ids
      if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== 'string' || id.length === 0 || id.length > 128)) {
        throw new Error('PET_ACTIVITY')
      }
      const activities: Record<string, SessionActivity> = {}
      for (const id of ids as string[]) {
        const session = host.sessions.get(id)
        if (session) activities[id] = readActivity(session)
      }
      return { activities }
    }, ['ids']))
    host.connection.fetch.register(createPetRoute(PET_LIST, async () => await view(), []))
    host.connection.fetch.register(createPetRoute(PET_SELECT, async payload => {
      const id = payload.id
      if (typeof id !== 'string' || id.length === 0 || id.length > 128) throw new Error('PET_UNKNOWN')
      await store.select(id)
      return await view()
    }, ['id']))
    host.connection.fetch.register(createPetRoute(PET_MOVE, async payload => {
      const { x, y } = payload
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('PET_POSITION')
      await store.move({ x: x as number, y: y as number })
      return await view()
    }, ['x', 'y']))
    host.connection.fetch.register(createAtlasRoute(PET_ATLAS, async id => {
      const { entry, bytes } = await store.atlas(id)
      return { bytes, mime: entry.mime }
    }))
  })
}

export { PET_ACTIVITY, PET_ATLAS, PET_LIST, PET_MOVE, PET_SELECT }
