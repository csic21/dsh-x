import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { listAsar, readAsar } from '../src/asar.ts'
import { discoverBuiltin } from '../src/builtin.ts'

/** A 1536×2288 PNG header. The atlas check only reads IHDR. */
function pngHeader(): Buffer {
  const bytes = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(1536, 16)
  bytes.writeUInt32BE(2288, 20)
  return bytes
}

/** One asar whose header matches the layout this plugin reads. */
function asar(files: Record<string, Buffer>): Buffer {
  const header: { files: Record<string, unknown> } = { files: {} }
  let offset = 0
  const payload: Buffer[] = []
  for (const [name, body] of Object.entries(files)) {
    const parts = name.split('/')
    let node = header
    for (const part of parts.slice(0, -1)) {
      const next = (node.files[part] ??= { files: {} }) as { files: Record<string, unknown> }
      node = next
    }
    node.files[parts.at(-1)!] = { size: body.length, offset: String(offset) }
    payload.push(body)
    offset += body.length
  }
  const json = Buffer.from(JSON.stringify(header))
  const base = 16 + (json.length + 3 & ~3)
  const out = Buffer.alloc(base + offset)
  out.writeUInt32LE(json.length, 12)
  json.copy(out, 16)
  Buffer.concat(payload).copy(out, base)
  return out
}

test('an asar listing round-trips one named file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-x-pet-asar-'))
  try {
    const file = path.join(directory, 'app.asar')
    const body = Buffer.from('sprite-bytes')
    await writeFile(file, asar({ 'webview/assets/codex-spritesheet-v2-abcd.webp': body, 'webview/assets/other.txt': Buffer.from('no') }))
    const listed = await listAsar(file, /spritesheet/)
    assert.equal(listed.length, 1)
    assert.equal(listed[0].path, 'webview/assets/codex-spritesheet-v2-abcd.webp')
    assert.equal(Buffer.from(await readAsar(file, listed[0])).toString(), 'sprite-bytes')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('built-in pets are discovered from spritesheet names and kept in Codex order', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dsh-x-pet-builtin-'))
  try {
    const file = path.join(directory, 'app.asar')
    const sheet = pngHeader()
    await writeFile(file, asar({
      'webview/assets/rocky-spritesheet-v5-aaaa.webp': sheet,
      'webview/assets/codex-spritesheet-v1-bbbb.webp': sheet,
      'webview/assets/codex-spritesheet-v6-cccc.webp': sheet,
      'webview/assets/not-a-pet.webp': sheet,
    }))
    const pets = await discoverBuiltin(file)
    assert.deepEqual(pets.map(pet => pet.entry.id), ['codex:codex', 'codex:rocky'])
    assert.equal(pets[0].entry.displayName, 'Codex')
    assert.equal(pets[0].entry.source, 'codex')
    assert.equal(pets[0].entry.rows, 11)
    assert.match(pets[0].file.path, /codex-spritesheet-v6/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('the installed Codex app, when present, exposes its built-in pets', async () => {
  const file = '/Applications/ChatGPT.app/Contents/Resources/app.asar'
  if (!existsSync(file)) return
  const pets = await discoverBuiltin(file)
  assert.ok(pets.length >= 8, `expected the Codex cast, saw ${pets.map(pet => pet.entry.id).join(', ')}`)
  assert.equal(pets[0].entry.id, 'codex:codex')
  assert.equal(pets[0].entry.rows, 11)
})
