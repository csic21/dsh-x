import type { Context } from '@deepseek-ai/cordis'
import { createUiRoute } from './routes.ts'
import type { UiRoute } from './routes.ts'
import { createUiStore, readPatch, resolveAppearance } from './store.ts'
import type { UiAppearance, UiAppearancePatch, UiStore } from './store.ts'

/** Official host services this plugin consumes, without a shipped type dependency. */
interface UiHostServices {
  profileContext: { dir: string }
  connection: { fetch: { register(route: UiRoute): () => void } }
}

export const name = 'dsh-x-ui'
export const inject = ['profileContext']

/**
 * Composition-level defaults. They seed a profile that has never stored a
 * choice; after the first toggle the stored file wins, so a Config change on
 * upgrade never silently reverses what the user picked.
 */
export interface UiConfig {
  /** `false` keeps the shipped palette until the user turns the treatment on. */
  enabled?: boolean
  /** Blur and fill strength. */
  level?: 'clear' | 'regular' | 'dense'
  /** Paint the living gradient behind the columns. */
  backdrop?: boolean
  /** Draw the specular rim and highlight on elevated surfaces. */
  refraction?: boolean
}

export const READ_ENDPOINT = 'dsh-x-ui/read'
export const WRITE_ENDPOINT = 'dsh-x-ui/write'

const configDefaults = (config: UiConfig): UiAppearancePatch => {
  const patch: UiAppearancePatch = {}
  if (typeof config.enabled === 'boolean') patch.enabled = config.enabled
  if (config.level !== undefined) patch.level = config.level
  if (typeof config.backdrop === 'boolean') patch.backdrop = config.backdrop
  if (typeof config.refraction === 'boolean') patch.refraction = config.refraction
  return patch
}

export function apply(ctx: Context, config: UiConfig = {}) {
  const services = ctx as Context & UiHostServices
  const store: UiStore = createUiStore(services.profileContext.dir)
  const seed = configDefaults(config)

  // Reading resolves what the Client should paint; writing merges the patch over
  // the same resolution, so a partial write never drops the seeded fields.
  const current = async (): Promise<UiAppearance> => resolveAppearance(await store.read(), seed)

  ctx.inject(['connection'], injected => {
    const host = injected as Context & UiHostServices
    host.connection.fetch.register(createUiRoute(READ_ENDPOINT, async () => await current(), []))
    host.connection.fetch.register(createUiRoute(WRITE_ENDPOINT, async payload => {
      const patch = readPatch(payload)
      return await store.write(patch, await current())
    }, ['enabled', 'level', 'backdrop', 'refraction']))
  })
}

export { createUiStore, normalizeAppearance, readPatch, resolveAppearance } from './store.ts'
export type { GlassLevel, UiAppearance, UiAppearanceFields, UiAppearancePatch, UiStore } from './store.ts'
