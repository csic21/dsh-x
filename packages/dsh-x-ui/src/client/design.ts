/**
 * The glass design tokens, expressed as alpha over the host's own palette.
 *
 * Colors come from the shipped `--dsw-static-*` primitives rather than from
 * literals, so the treatment follows the palette it sits on and a future host
 * palette change carries through. Only the opacity and the blur are ours.
 */
export type Level = 'clear' | 'regular' | 'dense'

/** How much of the shipped opacity a level keeps, and how far it blurs. */
export interface LevelSpec {
  /** Multiplier applied to every surface alpha. */
  tint: number
  /** Blur radius in px for surfaces that float over scrolling content. */
  blur: number
}

export const LEVELS: Readonly<Record<Level, LevelSpec>> = Object.freeze({
  clear: Object.freeze({ tint: 0.72, blur: 16 }),
  regular: Object.freeze({ tint: 1, blur: 28 }),
  dense: Object.freeze({ tint: 1.28, blur: 40 }),
})

/** A surface's resting alpha at the `regular` level. */
export interface SurfaceAlpha {
  base: number
  layer1: number
  layer2: number
  layer3: number
  overlay: number
  sidebar: number
  composer: number
  menu: number
  menuHeader: number
  mask: number
  code: number
  bubble: number
  floating: number
  module: number
  /** Pills that paint light text in both schemes stay dark and nearly solid. */
  tooltip: number
  toast: number
}

export const ALPHA: SurfaceAlpha = Object.freeze({
  base: 0.58,
  layer1: 0.66,
  layer2: 0.74,
  layer3: 0.82,
  overlay: 0.78,
  sidebar: 0.3,
  composer: 0.54,
  menu: 0.72,
  menuHeader: 0.9,
  mask: 0.2,
  code: 0.72,
  bubble: 0.58,
  floating: 0.7,
  module: 0.42,
  tooltip: 0.94,
  toast: 0.9,
})

/** Alpha for one surface at one level, clamped to a range that stays legible. */
export function alphaOf(surface: keyof SurfaceAlpha, level: Level): number {
  const value = ALPHA[surface] * LEVELS[level].tint
  // A surface below ~6% is invisible; above ~96% the blur behind it is wasted.
  return Math.min(0.96, Math.max(0.06, Math.round(value * 1000) / 1000))
}

/**
 * `color-mix` over a palette primitive: the host keeps the color, the plugin
 * only says how much of it shows.
 */
export function tint(primitive: string, alpha: number): string {
  return `color-mix(in srgb, var(${primitive}) ${Math.round(alpha * 100)}%, transparent)`
}

/** The neutral a scheme fills its glass with: white in light, near-black in dark. */
export const GLASS_NEUTRAL = Object.freeze({ light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-900' })

/**
 * The ambient field behind the columns. Without something colored to refract,
 * glass reads as plain translucency; these pools are what the surfaces sample.
 * Values are artwork, so they are literals, but every hue is a brand primitive.
 */
export function backdropLayers(): string {
  // Four pools at the frame's corners, warm against cool, so a blurred surface
  // over any of them picks up a different hue instead of one flat wash.
  return [
    'radial-gradient(56% 44% at 10% 6%, color-mix(in srgb, var(--dsw-static-blue-500) 34%, transparent) 0%, transparent 68%)',
    'radial-gradient(50% 42% at 92% 2%, color-mix(in srgb, var(--dsw-static-deepseek-400) 26%, transparent) 0%, transparent 70%)',
    'radial-gradient(62% 52% at 84% 98%, color-mix(in srgb, var(--dsw-static-blue-300) 24%, transparent) 0%, transparent 68%)',
    'radial-gradient(46% 40% at 16% 94%, color-mix(in srgb, var(--dsw-static-deepseek-200) 20%, transparent) 0%, transparent 70%)',
  ].join(',\n    ')
}

/** The base the pools sit on, per scheme. */
export const BACKDROP_BASE = Object.freeze({
  light: 'var(--dsw-static-neutral-bluish-50)',
  dark: 'var(--dsw-static-neutral-bluish-950)',
})
