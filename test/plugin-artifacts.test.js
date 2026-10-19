import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'

// Unit tests import TypeScript source. Verify the entries that actually ship,
// including declarations and the lazy client factory consumed by the host.
for (const name of ['dsh-x-code', 'dsh-x-stock', 'dsh-x-browser', 'dsh-x-delegate']) {
  test(`${name} publishes its built host entry and declarations`, async () => {
    const root = new URL(`../packages/${name}/`, import.meta.url)
    const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
    assert.equal(manifest.main, './lib/index.js')
    assert.equal(manifest.exports['.'], './lib/index.js')
    const plugin = await import(new URL(manifest.main, root).href)
    assert.equal(plugin.name, name)
    assert.ok(Array.isArray(plugin.inject)); assert.equal(typeof plugin.apply, 'function')
    await access(new URL('lib/index.d.ts', root))
    if (manifest.dsh?.client) {
      const client = await readFile(new URL(manifest.exports['./client'], root), 'utf8')
      assert.match(client, /window\.__ModuleLoader__\.load\(/)
      assert.ok(client.includes(`id: "${name}"`))
    }
  })
}
