import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { collectEvidence, renderEvidence } from '../src/collect.js'

test('evidence includes the diff and the acceptance command output', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dsh-x-evidence-'))
  try {
    await git(root, ['init'])
    await git(root, ['config', 'user.email', 'dsh-x@example.com'])
    await git(root, ['config', 'user.name', 'dsh-x'])
    writeFileSync(path.join(root, 'note.txt'), 'before\n')
    await git(root, ['add', 'note.txt'])
    await git(root, ['commit', '-m', 'init'])
    writeFileSync(path.join(root, 'note.txt'), 'after\n')
    const evidence = await collectEvidence(nodeSpawn, {
      cwd: root,
      commands: ['printf planned'],
    })
    assert.match(evidence.diff, /after/)
    assert.equal(evidence.runs[0].exitCode, 0)
    assert.match(evidence.runs[0].output, /planned/)
    const packet = renderEvidence('批准的计划', evidence)
    assert.match(packet, /批准的计划/)
    assert.match(packet, /printf planned/)
    assert.match(packet, /after/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd })
    child.on('error', reject)
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} -> ${code}`))))
  })
}

function nodeSpawn(spec) {
  const child = spawn(spec.argv[0], spec.argv.slice(1), {
    cwd: spec.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: spec.signal,
  })
  return {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    done: new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('close', (exitCode, exitSignal) => resolve({ exitCode, signal: exitSignal }))
    }),
    terminate() {
      child.kill('SIGTERM')
    },
  }
}
