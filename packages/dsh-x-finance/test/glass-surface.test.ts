import { CSS } from '../src/client/styles.ts'
import test from 'node:test'
import assert from 'node:assert/strict'

// The glass theme (dsh-x-ui) publishes two surface variables this package reads:
// --dxu-blur-panel for chrome that floats over the transcript, and --dxu-pane
// for a content surface that must stay readable. Both fall back to the shipped
// fill, so every rule stays inert on a Harness without that theme.
//
// The footer bar floats over the transcript; the page body is where quote
//    tables and headings are read.
const declarations = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * The declarations that actually win for `selector`: the last rule in document
 * order whose selector list names it. These sheets override earlier rules for
 * the same selector, so taking the first match would read a stale value.
 */
function ruleFor(css: string, selector: string): string | null {
  let found: string | null = null
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].split(',').some(part => part.trim() === selector)) found = match[2]
  }
  return found
}

test('floating chrome carries the glass blur and falls back to none', () => {
  const css = declarations(CSS)
  for (const selector of [".dxs-bar"]) {
    const body = ruleFor(css, selector)
    assert.ok(body !== null, `${selector} must have a rule`)
    assert.match(body, /backdrop-filter:\s*var\(--dxu-blur-panel,\s*none\)/, `${selector} must fall back to none`)
    assert.match(body, /-webkit-backdrop-filter:\s*var\(--dxu-blur-panel,\s*none\)/, `${selector} needs the prefixed form`)
  }
})

test('a content pane reads the shared near-opaque fill', () => {
  const css = declarations(CSS)
  for (const selector of [".dxs-page"]) {
    const body = ruleFor(css, selector)
    assert.ok(body !== null, `${selector} must have a rule`)
    assert.match(body, /background:\s*var\(--dxu-pane,/, `${selector} must read the shared pane fill`)
  }
})

test('no blur lands on a host that owns a fixed-position descendant', () => {
  const css = declarations(CSS)
  for (const selector of []) {
    const body = ruleFor(css, selector)
    if (body !== null) assert.doesNotMatch(body, /backdrop-filter/, `${selector} must not carry a blur`)
  }
})
