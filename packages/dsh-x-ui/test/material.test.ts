import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_APPEARANCE } from '../src/store.ts'
import type { UiAppearance } from '../src/store.ts'
import { ALPHA, LEVELS, alphaOf } from '../src/client/design.ts'
import { stylesheet } from '../src/client/material.ts'
import { GLASS_TOKENS, referencedVariables } from '../src/client/tokens.ts'

const appearance = (patch: Partial<UiAppearance> = {}): UiAppearance => ({ ...DEFAULT_APPEARANCE, ...patch })

/** Strip comments so prose about colors never counts as a color. */
const declarations = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

test('every token layer value is a pair of strings the theme service accepts', () => {
  for (const [name, modes] of Object.entries(GLASS_TOKENS)) {
    assert.ok(name.startsWith('--'), `${name} must be a custom property`)
    assert.equal(typeof modes.light, 'string', name)
    assert.equal(typeof modes.dark, 'string', name)
    assert.ok(modes.light.length > 0 && modes.dark.length > 0, name)
  }
})

test('the token layer only restyles surfaces, never text, state or brand colors', () => {
  // A translucent label would lose contrast the moment the backdrop moved
  // behind it, so those families must stay untouched.
  for (const name of Object.keys(GLASS_TOKENS)) {
    assert.doesNotMatch(name, /label|state-|brand|link|code-diff|file-diff|shiki/, name)
  }
})

test('the stylesheet defines every variable the token layer resolves', () => {
  const css = declarations(stylesheet(appearance()))
  for (const name of referencedVariables()) {
    assert.match(css, new RegExp(`${name}\\s*:`), `${name} must be declared by the material sheet`)
  }
})

test('the surface contract other plugins read is published per scheme', () => {
  // Sibling plugins style their own panels with these two names and fall back to
  // their shipped fill, so both must exist in both palettes and both must
  // collapse under reduced transparency.
  const css = declarations(stylesheet(appearance()))
  // The scheme variable blocks are the ones that declare the pane; the ambient
  // field rules share the `html body` selector and must not be mistaken for them.
  const firstPane = css.indexOf('--dxu-pane:')
  const light = css.slice(css.lastIndexOf('html body {', firstPane), css.indexOf('html body[data-ds-dark-theme] {', firstPane))
  const dark = css.slice(css.indexOf('html body[data-ds-dark-theme] {', firstPane), css.indexOf('[data-shell-overlay]'))

  for (const block of [light, dark]) {
    assert.match(block, /--dxu-blur-panel:\s*blur\(/, 'a blur must be published')
    assert.match(block, /--dxu-pane:\s*color-mix\(in srgb, var\(--dsw-static-/, 'the pane must mix a shipped primitive')
  }
  // A pane is where text is read: nearly opaque, never a moving field.
  const pane = light.match(/--dxu-pane:\s*color-mix\(in srgb, var\([^)]+\)\s*(\d+)%/)
  assert.ok(pane, 'the pane must declare an alpha')
  assert.ok(Number(pane[1]) >= 90, `the pane must stay nearly opaque, got ${pane[1]}%`)

  const reduced = css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce)'))
  assert.match(reduced, /--dxu-blur-panel:\s*none;/)
  assert.match(reduced, /--dxu-pane:\s*var\(--dsw-static-/)
})

test('the material sheet writes no literal palette colors into surface fills', () => {
  const css = declarations(stylesheet(appearance()))
  // Fills must resolve through a shipped primitive, so the treatment follows
  // the host palette instead of freezing today's colors into the plugin.
  for (const name of ['--dxu-base', '--dxu-layer-1', '--dxu-layer-2', '--dxu-layer-3', '--dxu-composer', '--dxu-sidebar', '--dxu-menu']) {
    const declaration = css.match(new RegExp(`${name}:\\s*([^;]+);`))
    assert.ok(declaration, `${name} must be declared`)
    assert.match(declaration[1], /color-mix\(in srgb, var\(--dsw-static-/, `${name} must mix a shipped primitive`)
  }
})

test('the anchor hooks are the host data attributes, never a hashed class', () => {
  const css = declarations(stylesheet(appearance()))
  const anchors = [...css.matchAll(/\[data-[a-z-]+[^\]]*\]/g)].map(match => match[0])
  assert.ok(anchors.length >= 3, 'expected the material to anchor on host hooks')
  for (const anchor of anchors) {
    assert.doesNotMatch(anchor, /_[A-Za-z0-9]{5,}/, `${anchor} looks like a hashed module class`)
  }
  // A build-hashed class selector would break on the next host rebuild.
  assert.doesNotMatch(css, /\.[A-Za-z0-9-]{4,}_[A-Za-z]/, 'no hashed module class may be selected')
})

test('the level changes the material, and a stronger level is more opaque', () => {
  const clear = stylesheet(appearance({ level: 'clear' }))
  const dense = stylesheet(appearance({ level: 'dense' }))
  assert.notEqual(clear, dense)
  for (const surface of ['base', 'layer1', 'layer2', 'composer', 'menu'] as const) {
    assert.ok(alphaOf(surface, 'dense') > alphaOf(surface, 'clear'), surface)
  }
  assert.ok(LEVELS.dense.blur > LEVELS.clear.blur)
  // A surface may never become invisible or fully opaque by accident.
  for (const surface of Object.keys(ALPHA) as Array<keyof typeof ALPHA>) {
    for (const level of ['clear', 'regular', 'dense'] as const) {
      const value = alphaOf(surface, level)
      assert.ok(value >= 0.06 && value <= 0.96, `${surface}/${level} = ${value}`)
    }
  }
})

test('the two switches each remove exactly their own layer', () => {
  const full = declarations(stylesheet(appearance()))
  assert.match(full, /\[data-composer-card\]::before/)
  assert.match(full, /radial-gradient\(56% 44%/)

  const noRefraction = declarations(stylesheet(appearance({ refraction: false })))
  assert.doesNotMatch(noRefraction, /\[data-composer-card\]::before/)
  // The rest of the material is unaffected.
  assert.match(noRefraction, /\[data-composer-card\] \{\n  backdrop-filter/)

  const noBackdrop = declarations(stylesheet(appearance({ backdrop: false })))
  // With no field there is nothing to refract, so the backdrop pools are not
  // emitted at all rather than painted at zero opacity. The specular highlight
  // is a different gradient and must survive.
  assert.doesNotMatch(noBackdrop, /56% 44% at 10% 6%/)
  assert.match(noBackdrop, /background: none;/)
  assert.match(noBackdrop, /\[data-composer-card\]::before/)
})

test('reduced transparency and reduced motion are both honoured', () => {
  const css = declarations(stylesheet(appearance()))
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  // The reduced-transparency block must drop the blur, not merely dim it.
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce)'))
  assert.match(reduced, /backdrop-filter: none/)
  assert.match(reduced, /--dxu-blur: 0px/)
})
