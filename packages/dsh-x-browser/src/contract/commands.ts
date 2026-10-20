/** Every action any backend may implement; a backend exposes a bounded subset. */
export const ACTIONS = [
  'observe',
  'navigate',
  'click',
  'type',
  'scroll',
  'press',
  'back',
  'forward',
  'reload',
  'select',
  'read',
  'screenshot',
] as const

export type Action = (typeof ACTIONS)[number]

/** Actions the embedded webview backend implements today; the model-facing protocol stays this small. */
export const EMBEDDED_ACTIONS = [
  'observe',
  'navigate',
  'click',
  'type',
  'scroll',
  'press',
  'back',
  'forward',
  'reload',
] as const satisfies readonly Action[]

export type EmbeddedAction = (typeof EMBEDDED_ACTIONS)[number]

/** Actions the CDP backend exposes to the model today; `read` and `screenshot` stay internal. */
export const CDP_ACTIONS = [
  'observe',
  'navigate',
  'click',
  'type',
  'scroll',
  'press',
  'back',
  'forward',
  'reload',
  'select',
] as const satisfies readonly Action[]

export type CdpAction = (typeof CDP_ACTIONS)[number]

/** Admitted payload fields, navigation semantics and mutation intent per action. */
export interface ActionSpec {
  readonly fields: readonly string[]
  readonly navigation: boolean
  readonly mutates: boolean
}

export const ACTION_SPEC: Readonly<Record<Action, ActionSpec>> = {
  observe: { fields: [], navigation: false, mutates: false },
  navigate: { fields: ['url'], navigation: true, mutates: true },
  click: { fields: ['target'], navigation: false, mutates: true },
  type: { fields: ['target', 'text'], navigation: false, mutates: true },
  scroll: { fields: ['x', 'y'], navigation: false, mutates: false },
  press: { fields: ['key'], navigation: false, mutates: true },
  back: { fields: [], navigation: true, mutates: true },
  forward: { fields: [], navigation: true, mutates: true },
  reload: { fields: [], navigation: true, mutates: false },
  select: { fields: ['target', 'value'], navigation: false, mutates: true },
  read: { fields: ['url'], navigation: false, mutates: false },
  screenshot: { fields: [], navigation: false, mutates: false },
}

/** Actions that replace the current document; used to decide whether a stale epoch survives. */
export const NAVIGATION: ReadonlySet<string> = new Set(ACTIONS.filter(action => ACTION_SPEC[action].navigation))

export function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
}

export function actionFields(action: Action): readonly string[] {
  return ACTION_SPEC[action].fields
}

/** Reference formats are backend-owned; the protocol only bounds them. */
export const EMBEDDED_REF_PATTERN = /^e\d+:s\d+:n\d+$/
export const CDP_REF_PATTERN = /^[A-Za-z0-9:_@.-]{1,64}$/

/** One validated finite browser command; only the fields its action allows are present. */
export interface BrowserCommand {
  action: Action
  url?: string
  target?: string
  text?: string
  x?: number
  y?: number
  key?: string
  value?: string
}
