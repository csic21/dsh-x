import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { frameURL, needsCompile, shellArguments, shellBinary } from '../src/native.ts'

const scratch = () => mkdtempSync(path.join(tmpdir(), 'dsh-x-pet-native-'))

test('the shell binary lives in the profile, not the package', () => {
  assert.equal(shellBinary('/home/.dsh/profiles/desktop'), '/home/.dsh/profiles/desktop/.dsh-x-pet/pet-window')
})

test('a missing binary is compiled', () => {
  const dir = scratch()
  const source = path.join(dir, 'pet-window.swift')
  writeFileSync(source, '// source')
  assert.equal(needsCompile(source, path.join(dir, 'pet-window')), true)
})

test('the binary is rebuilt only when the source is newer', () => {
  const dir = scratch()
  const source = path.join(dir, 'pet-window.swift')
  const binary = path.join(dir, 'pet-window')
  writeFileSync(source, '// source')
  writeFileSync(binary, 'bin')
  const now = Date.now() / 1000
  utimesSync(source, now - 60, now - 60)
  utimesSync(binary, now, now)
  assert.equal(needsCompile(source, binary), false)
  utimesSync(source, now + 60, now + 60)
  assert.equal(needsCompile(source, binary), true)
})

test('the shell receives the tokenised bootstrap before the page', () => {
  const args = shellArguments('http://127.0.0.1:51312/api/dsh-x-pet/frame', 'http://127.0.0.1:51312/?token=t')
  assert.deepEqual(args, [
    '--bootstrap', 'http://127.0.0.1:51312/?token=t',
    '--page', 'http://127.0.0.1:51312/api/dsh-x-pet/frame',
  ])
})

test('the frame URL keeps the advertised mount', () => {
  assert.equal(frameURL('http://127.0.0.1:51312/'), 'http://127.0.0.1:51312/api/dsh-x-pet/frame')
  assert.equal(frameURL('https://dsh.example.com/harness/'), 'https://dsh.example.com/harness/api/dsh-x-pet/frame')
})
