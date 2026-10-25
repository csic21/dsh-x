import { BACKDROP_BASE, GLASS_NEUTRAL, LEVELS, backdropLayers, alphaOf, tint } from './design.ts'
import type { Level } from './design.ts'
import type { UiAppearance } from '../store.ts'

/**
 * The glass material, as one stylesheet the plugin owns.
 *
 * Two rules shape it:
 *
 * - Color authority stays with the host. Every fill is a color-mix over a
 *   --dsw-static-* primitive, so the material follows the shipped palette
 *   instead of replacing it.
 * - Anchors are the host's own data-* hooks and its documented token contract,
 *   never another plugin's class names. Class names are build-hashed
 *   (JZLxKW_card), so selecting on them would break on any host rebuild.
 *
 * The stylesheet only ever adds translucency, blur and a rim. Removing it
 * restores the shipped appearance with no residue.
 */

/** The per-scheme --dxu-* variables the token layer resolves against. */
function schemeVariables(level: Level, dark: boolean): string {
  const a = (surface: Parameters<typeof alphaOf>[0]) => alphaOf(surface, level)
  const spec = LEVELS[level]
  if (!dark) {
    return `
  --dxu-base: ${tint(GLASS_NEUTRAL.light, a('base'))};
  --dxu-layer-1: ${tint(GLASS_NEUTRAL.light, a('layer1'))};
  --dxu-layer-2: ${tint(GLASS_NEUTRAL.light, a('layer2'))};
  --dxu-layer-3: ${tint(GLASS_NEUTRAL.light, a('layer3'))};
  --dxu-overlay: ${tint(GLASS_NEUTRAL.light, a('overlay'))};
  --dxu-sidebar: ${tint(GLASS_NEUTRAL.light, a('sidebar'))};
  --dxu-composer: ${tint(GLASS_NEUTRAL.light, a('composer'))};
  --dxu-menu: ${tint(GLASS_NEUTRAL.light, a('menu'))};
  --dxu-menu-header: ${tint(GLASS_NEUTRAL.light, a('menuHeader'))};
  --dxu-mask: ${tint(GLASS_NEUTRAL.light, a('mask'))};
  --dxu-code: ${tint(GLASS_NEUTRAL.light, a('code'))};
  --dxu-bubble: ${tint('--dsw-static-blue-75', a('bubble'))};
  --dxu-floating: ${tint(GLASS_NEUTRAL.light, a('floating'))};
  --dxu-module: ${tint(GLASS_NEUTRAL.light, a('module'))};
  --dxu-tooltip: ${tint(GLASS_NEUTRAL.dark, a('tooltip'))};
  --dxu-toast: ${tint(GLASS_NEUTRAL.dark, a('toast'))};
  --dxu-menu-blur: blur(${spec.blur}px) saturate(185%);
  --dxu-mask-blur: blur(${Math.round(spec.blur * 0.36)}px);
  --dxu-rim: rgb(255 255 255 / 72%);
  --dxu-blur: ${spec.blur}px;
  --dxu-blur-soft: ${Math.round(spec.blur * 0.5)}px;
  --dxu-blur-panel: blur(${Math.round(spec.blur * 0.8)}px) saturate(150%);
  /* A content pane is where text is read, so it stays very nearly opaque: it
     picks up a hint of the backdrop (frosted, not flat) without putting long
     text on a moving field. Other plugins read this with their own fill as the
     fallback. */
  --dxu-pane: ${tint(GLASS_NEUTRAL.light, 0.94)};`
  }
  return `
  --dxu-base: ${tint(GLASS_NEUTRAL.dark, a('base'))};
  --dxu-layer-1: ${tint(GLASS_NEUTRAL.dark, a('layer1'))};
  --dxu-layer-2: ${tint(GLASS_NEUTRAL.dark, a('layer2'))};
  --dxu-layer-3: ${tint(GLASS_NEUTRAL.dark, a('layer3'))};
  --dxu-overlay: ${tint(GLASS_NEUTRAL.dark, a('overlay'))};
  --dxu-sidebar: ${tint(GLASS_NEUTRAL.dark, a('sidebar'))};
  --dxu-composer: ${tint(GLASS_NEUTRAL.dark, a('composer'))};
  --dxu-menu: ${tint(GLASS_NEUTRAL.dark, a('menu'))};
  --dxu-menu-header: ${tint(GLASS_NEUTRAL.dark, a('menuHeader'))};
  --dxu-mask: rgb(0 0 0 / ${Math.round(Math.min(0.7, 0.42 * spec.tint) * 100)}%);
  --dxu-code: ${tint('--dsw-static-neutral-bluish-950', a('code'))};
  --dxu-bubble: ${tint('--dsw-static-neutral-bluish-850', a('bubble'))};
  --dxu-floating: ${tint(GLASS_NEUTRAL.dark, a('floating'))};
  --dxu-module: rgb(255 255 255 / ${Math.round(Math.min(0.14, 0.06 * spec.tint) * 100)}%);
  --dxu-tooltip: ${tint('--dsw-static-neutral-bluish-800', a('tooltip'))};
  --dxu-toast: ${tint('--dsw-static-neutral-bluish-800', a('toast'))};
  --dxu-menu-blur: blur(${spec.blur}px) saturate(185%);
  --dxu-mask-blur: blur(${Math.round(spec.blur * 0.36)}px);
  --dxu-rim: rgb(255 255 255 / 12%);
  --dxu-blur: ${spec.blur}px;
  --dxu-blur-soft: ${Math.round(spec.blur * 0.5)}px;
  --dxu-blur-panel: blur(${Math.round(spec.blur * 0.8)}px) saturate(150%);
  --dxu-pane: ${tint(GLASS_NEUTRAL.dark, 0.94)};`
}

/** The specular rim, only emitted while the user keeps refraction on. */
function specular(): string {
  return `
/* One hairline highlight along the top edge and a faint inner glow is what the
   eye reads as a bevel. A pseudo-element keeps it out of layout and out of hit
   testing. */
[data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 34%) 0%, transparent 18%),
    radial-gradient(120% 60% at 50% 0%, rgb(255 255 255 / 22%) 0%, transparent 62%);
  mix-blend-mode: screen;
  opacity: 0.9;
}
html body[data-ds-dark-theme] [data-composer-card]::before {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 10%) 0%, transparent 20%),
    radial-gradient(120% 60% at 50% 0%, rgb(255 255 255 / 7%) 0%, transparent 64%);
}`
}

/**
 * The opaque fallback for prefers-reduced-transparency. It repeats the shipped
 * palette values so a user who asked for less transparency keeps a readable
 * interface instead of a washed-out one.
 */
function reducedTransparency(): string {
  const light: Array<[string, string]> = [
    ['--dxu-base', '--dsw-static-neutral-bluish-00'],
    ['--dxu-layer-1', '--dsw-static-neutral-bluish-00'],
    ['--dxu-layer-2', '--dsw-static-neutral-bluish-00'],
    ['--dxu-layer-3', '--dsw-static-neutral-bluish-00'],
    ['--dxu-overlay', '--dsw-static-neutral-bluish-00'],
    ['--dxu-sidebar', '--dsw-static-neutral-bluish-50'],
    ['--dxu-composer', '--dsw-static-neutral-bluish-00'],
    ['--dxu-menu', '--dsw-static-neutral-bluish-50'],
    ['--dxu-menu-header', '--dsw-static-neutral-bluish-50'],
    ['--dxu-code', '--dsw-static-neutral-bluish-50'],
    ['--dxu-bubble', '--dsw-static-deepseek-50'],
    ['--dxu-floating', '--dsw-static-neutral-bluish-00'],
    ['--dxu-module', '--dsw-static-neutral-bluish-60'],
    ['--dxu-pane', '--dsw-static-neutral-bluish-00'],
  ]
  const dark: Array<[string, string]> = [
    ['--dxu-base', '--dsw-static-neutral-bluish-950'],
    ['--dxu-layer-1', '--dsw-static-neutral-bluish-875'],
    ['--dxu-layer-2', '--dsw-static-neutral-bluish-850'],
    ['--dxu-layer-3', '--dsw-static-neutral-bluish-800'],
    ['--dxu-overlay', '--dsw-static-neutral-bluish-700'],
    ['--dxu-sidebar', '--dsw-static-neutral-bluish-900'],
    ['--dxu-composer', '--dsw-static-neutral-bluish-850'],
    ['--dxu-menu', '--dsw-static-neutral-bluish-850'],
    ['--dxu-menu-header', '--dsw-static-neutral-bluish-850'],
    ['--dxu-code', '--dsw-static-neutral-bluish-900'],
    ['--dxu-bubble', '--dsw-static-neutral-bluish-850'],
    ['--dxu-floating', '--dsw-static-neutral-bluish-850'],
    ['--dxu-module', '--dsw-static-neutral-bluish-800'],
    ['--dxu-pane', '--dsw-static-neutral-bluish-950'],
  ]
  const block = (selector: string, entries: Array<[string, string]>): string =>
    `${selector} {\n${entries.map(([name, value]) => `    ${name}: var(${value});`).join('\n')}\n  }`
  return `
@media (prefers-reduced-transparency: reduce) {
  ${block('html body', light)}
  ${block('html body[data-ds-dark-theme]', dark)}
  html body {
    --dxu-menu-blur: none;
    --dxu-mask-blur: none;
    --dxu-blur: 0px;
    --dxu-blur-soft: 0px;
    --dxu-blur-panel: none;
  }
  html body::before { display: none; }
  [data-composer-card], [role='dialog'], [data-menu-material] {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}`
}

export function stylesheet(appearance: UiAppearance): string {
  const level = appearance.level as Level
  // With the field switched off there is nothing to refract, so the gradient is
  // not emitted at all: an invisible full-viewport layer would still cost paint.
  const field = appearance.backdrop
    ? `background:\n    ${backdropLayers()};`
    : 'background: none;'
  return `
/* The ambient field. Glass needs something to refract: one fixed layer behind
   the app, so it never scrolls, never repaints on layout, and never takes a
   pointer event. Isolation gives it a stacking context behind the app root
   without a negative z-index fight against the host's own layers. */
html body {
  isolation: isolate;
  background: ${BACKDROP_BASE.light};
}
html body[data-ds-dark-theme] {
  background: ${BACKDROP_BASE.dark};
}
html body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  ${field}
  opacity: 1;
  transition: opacity 240ms var(--ds-ease-in-out, ease);
}
/* Native macOS vibrancy already blurs the desktop behind the window, and the
   Electron window is transparent over it. Painting an opaque base here would
   cover that material, so the base steps aside and only the field remains. */
html[data-platform='darwin'] body {
  background: transparent;
}
html[data-platform='darwin'] body::before { opacity: 0.72; }

/* The scheme variables the token layer resolves against. */
html body {${schemeVariables(level, false)}
}
html body[data-ds-dark-theme] {${schemeVariables(level, true)}
}

/* The sidebar is the clearest surface: it carries the material's character and
   no long-form text. The centre column keeps more body so the transcript stays
   readable for long stretches. */
[data-shell-overlay], [data-shell-bottom] { background: transparent; }

/* Menus already paint their material through --dsw-menu-surface-fill and
   --dsw-menu-backdrop-filter; the token layer covers both. What is missing is
   the specular edge that separates glass from tint, and the same edge is what
   makes a dialog read as a sheet of material rather than a rounded rectangle. */
[data-menu-material] {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 42%),
    0 0 0 0.5px rgb(255 255 255 / 22%),
    0 12px 32px rgb(8 12 20 / 16%);
}
html body[data-ds-dark-theme] [data-menu-material] {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 8%),
    0 0 0 0.5px rgb(255 255 255 / 8%),
    0 12px 32px rgb(0 0 0 / 38%);
}

/* The composer is the one surface with content scrolling directly behind it, so
   it gets a real blur rather than only a tint. Scoped to the composer card's own
   hook, so it cannot reach a panel that happens to sit in the same column. */
[data-composer-card] {
  backdrop-filter: blur(var(--dxu-blur)) saturate(180%);
  -webkit-backdrop-filter: blur(var(--dxu-blur)) saturate(180%);
}

/* Dialogs: the mask carries the blur, the card carries the material. */
[role='dialog'] {
  backdrop-filter: blur(var(--dxu-blur-soft)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--dxu-blur-soft)) saturate(160%);
}
${appearance.refraction ? specular() : ''}
${reducedTransparency()}

@media (prefers-reduced-motion: reduce) {
  html body::before { transition: none; }
}
`
}
