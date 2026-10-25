/**
 * The token layer the glass treatment installs through `ctx.theme.overrideTokens`.
 *
 * Every value is a reference to a `--dxu-*` variable that the plugin's own
 * stylesheet defines per level, platform and color scheme, with the shipped
 * value as the fallback. Two consequences matter:
 *
 * - The treatment is one layer on top of the shipped palette, so removing it
 *   restores the original look exactly.
 * - Only tokens that describe a *surface* are touched. Label, state, brand and
 *   code-syntax colors keep their authority, because a translucent label would
 *   become unreadable the moment the backdrop moved behind it.
 */
export interface TokenModes {
  light: string
  dark: string
}

export const TOKEN_SOURCE = 'dsh-x-ui'

export const GLASS_TOKENS: Readonly<Record<string, TokenModes>> = Object.freeze({
  // Columns and the transcript sit on the base surface; it is the one that lets
  // the backdrop read through the whole frame.
  '--dsw-alias-bg-base': pair('var(--dxu-base, rgb(255 255 255 / 62%))', 'var(--dxu-base, rgb(18 20 26 / 62%))'),
  // Raised surfaces, from a card to a nested panel. Alpha rises with elevation:
  // a dialog needs more body than a card, or text over a busy backdrop swims.
  '--dsw-alias-bg-layer-1': pair('var(--dxu-layer-1, rgb(255 255 255 / 70%))', 'var(--dxu-layer-1, rgb(28 31 38 / 66%))'),
  '--dsw-alias-bg-layer-2': pair('var(--dxu-layer-2, rgb(255 255 255 / 78%))', 'var(--dxu-layer-2, rgb(32 35 43 / 72%))'),
  '--dsw-alias-bg-layer-3': pair('var(--dxu-layer-3, rgb(255 255 255 / 86%))', 'var(--dxu-layer-3, rgb(38 42 50 / 78%))'),
  '--dsw-alias-bg-overlay': pair('var(--dxu-overlay, rgb(250 251 253 / 80%))', 'var(--dxu-overlay, rgb(30 33 40 / 82%))'),
  // Chrome. The sidebar is deliberately the clearest surface in the app: it is
  // where the material is most visible and where no long text has to be read.
  '--dsw-specific-sidebar-fill': pair('var(--dxu-sidebar, rgb(255 255 255 / 34%))', 'var(--dxu-sidebar, rgb(24 27 33 / 44%))'),
  // The composer is glass with real blur, because content scrolls behind it.
  '--dsw-specific-input-major': pair('var(--dxu-composer, rgb(255 255 255 / 56%))', 'var(--dxu-composer, rgb(32 35 43 / 62%))'),
  // Menus and popovers float over live content, so they keep the strongest fill.
  '--dsw-menu-surface-fill': pair('var(--dxu-menu, rgb(250 251 253 / 74%))', 'var(--dxu-menu, rgb(38 41 49 / 76%))'),
  '--dsw-specific-menu': pair('var(--dxu-menu, rgb(250 251 253 / 74%))', 'var(--dxu-menu, rgb(38 41 49 / 76%))'),
  '--dsw-alias-menu-group-header-fill': pair('var(--dxu-menu-header, rgb(250 251 253 / 92%))', 'var(--dxu-menu-header, rgb(38 41 49 / 92%))'),
  // The mask behind a dialog is the one place a real blur earns its cost.
  '--dsw-alias-bg-mask-1': pair('var(--dxu-mask, rgb(12 16 24 / 18%))', 'var(--dxu-mask, rgb(0 0 0 / 46%))'),
  // Reading surfaces keep enough body to stay legible; glass must not win over text.
  '--dsw-alias-markdown-code-block': pair('var(--dxu-code, rgb(255 255 255 / 76%))', 'var(--dxu-code, rgb(10 12 16 / 66%))'),
  '--dsw-specific-bubble': pair('var(--dxu-bubble, rgb(236 241 255 / 62%))', 'var(--dxu-bubble, rgb(40 46 60 / 60%))'),
  '--dsw-alias-button-floating-fill': pair('var(--dxu-floating, rgb(255 255 255 / 72%))', 'var(--dxu-floating, rgb(40 43 51 / 74%))'),
  '--dsw-alias-button-elevated-fill': pair('var(--dxu-floating, rgb(255 255 255 / 72%))', 'var(--dxu-floating, rgb(40 43 51 / 74%))'),
  '--dsw-alias-bg-module-platform': pair('var(--dxu-module, rgb(255 255 255 / 46%))', 'var(--dxu-module, rgb(255 255 255 / 6%))'),
  // Both of these paint near-white text on a dark pill in BOTH palettes, so
  // their fill stays dark and only gains a little translucency.
  '--dsw-alias-tooltip-bg': pair('var(--dxu-tooltip, rgb(20 22 28 / 94%))', 'var(--dxu-tooltip, rgb(34 37 44 / 94%))'),
  '--dsw-alias-toast-bg': pair('var(--dxu-toast, rgb(24 26 32 / 90%))', 'var(--dxu-toast, rgb(34 37 44 / 90%))'),
  // Material. `--dsw-menu-backdrop-filter` and `--dsw-mask-blur` are declared by
  // the shipped stylesheet on `body`, so the presenter's inline write replaces
  // them and every consumer of the token follows.
  '--dsw-menu-backdrop-filter': pair('var(--dxu-menu-blur, blur(30px) saturate(185%))', 'var(--dxu-menu-blur, blur(30px) saturate(185%))'),
  '--dsw-mask-blur': pair('var(--dxu-mask-blur, blur(10px))', 'var(--dxu-mask-blur, blur(10px))'),
  // The elevation hairline is what draws the rim on every elevated surface in
  // the app; turning it into a light specular stroke is what makes those
  // surfaces read as glass instead of as flat tinted cards.
  '--dsw-elevation-stroke-color': pair('var(--dxu-rim, rgb(255 255 255 / 72%))', 'var(--dxu-rim, rgb(255 255 255 / 12%))'),
})

function pair(light: string, dark: string): TokenModes {
  return Object.freeze({ light, dark })
}

/** Every `--dxu-*` name the token layer expects the stylesheet to define. */
export function referencedVariables(): string[] {
  const names = new Set<string>()
  for (const modes of Object.values(GLASS_TOKENS)) {
    for (const value of [modes.light, modes.dark]) {
      for (const match of value.matchAll(/var\((--dxu-[a-z0-9-]+)/g)) names.add(match[1])
    }
  }
  return [...names].sort()
}
