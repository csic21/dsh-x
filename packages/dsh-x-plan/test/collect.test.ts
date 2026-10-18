import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { assertVisibleScope, captureBaseline, validateBaseline } from '../src/baseline.ts'
import { assessEvidence, collectEvidence, enforceEvidenceVerdict, renderEvidence } from '../src/collect.ts'

// All fixtures are owned temporary repositories; no real user checkout is read.
test('task evidence subtracts plan-time dirty content and captures new/untracked changes', async t => {
  const root = await fixture(t)
  write(root, 'note.txt', 'preexisting edit\n')
  write(root, 'draft.js', 'preexisting draft\n')
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  assert.equal(baseline.complete, true)
  write(root, 'note.txt', 'task edit\n')
  write(root, 'draft.js', 'task draft\n')
  write(root, 'new.js', 'new task file\n')
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline, commands: ['npm test'], runs: [passed('npm test')] })
  assert.equal(evidence.complete, true, JSON.stringify(evidence.issues))
  assert.deepEqual(evidence.changes.map((change: any) => [change.path, change.kind]), [['draft.js', 'modified'], ['new.js', 'added'], ['note.txt', 'modified']])
  assert.match(evidence.diff, /-preexisting edit/)
  assert.match(evidence.diff, /\+task edit/)
  assert.doesNotMatch(evidence.diff, /-original/)
  assert.match(renderEvidence('approved plan', evidence), /new task file/)
  assert.equal(assessEvidence(evidence).verdict, 'ready')
})

test('unchanged plan-time dirty and untracked files are not task changes', async t => {
  const root = await fixture(t)
  write(root, 'note.txt', 'preexisting edit\n')
  write(root, 'draft.js', 'preexisting draft\n')
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(evidence.complete, true)
  assert.equal(evidence.diff, '')
  assert.deepEqual(evidence.changes, [])
})

test('committed work remains visible against the captured HEAD', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  write(root, 'note.txt', 'committed task change\n')
  write(root, 'new.js', 'committed new file\n')
  await git(root, ['add', '.'])
  await git(root, ['commit', '-m', 'task change'])
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(evidence.complete, true, JSON.stringify(evidence.issues))
  assert.equal(evidence.status, '')
  assert.notEqual(evidence.currentHead, baseline.head)
  assert.match(evidence.diff, /committed task change/)
  assert.match(evidence.diff, /committed new file/)
})

test('collector never executes plan shell commands and missing runtime checks are inconclusive', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  const argv: any = []
  const evidence = await collectEvidence((spec: any) => { argv.push(spec.argv); return nodeSpawn(spec) }, {
    cwd: root, baseline, commands: ['touch should-not-exist.txt'],
  })
  assert.equal(existsSync(path.join(root, 'should-not-exist.txt')), false)
  assert.ok(argv.every((command: any) => command[0] === 'git'))
  assert.equal(assessEvidence(evidence).verdict, 'inconclusive')
  assert.equal(enforceEvidenceVerdict('pass', evidence).verdict, 'inconclusive')
})

test('nonzero and timeout are deterministic failures and model pass cannot override', () => {
  for (const run of [{ exitCode: 2 }, { exitCode: null, timedOut: true }, { exitCode: 0, timedOut: true }] as const) {
    const evidence = recordEvidence({ command: 'npm test', output: '', ...run })
    assert.equal(assessEvidence(evidence).verdict, 'fail')
    assert.equal(enforceEvidenceVerdict({ verdict: 'pass', gaps: '' }, evidence).verdict, 'fail')
  }
  const both: any = recordEvidence({ command: 'npm test', output: '', exitCode: 1, truncated: true })
  both.complete = false
  both.issues = [{ message: 'partial repository' }]
  assert.equal(assessEvidence(both).verdict, 'fail')
})

test('unavailable, cancelled, missing, mismatched and truncated checks never pass', () => {
  for (const run of [
    { exitCode: null }, { exitCode: 0, unavailable: true }, { exitCode: 0, truncated: true },
    { exitCode: 0, signal: 'SIGTERM' }, { exitCode: 0, status: 'cancelled' },
    { exitCode: 0, command: 'different command' },
  ] as const) {
    const evidence = recordEvidence({ command: 'npm test', output: '', ...run })
    assert.equal(enforceEvidenceVerdict('pass', evidence).verdict, 'inconclusive')
  }
  const missing = recordEvidence(passed('npm test'))
  missing.runs = []
  assert.equal(assessEvidence(missing).verdict, 'inconclusive')
  assert.equal(enforceEvidenceVerdict({ verdict: 'fail', gaps: 'model gap' }, recordEvidence(passed('npm test'))).verdict, 'fail')
})

test('cwd drift within the same repository and a different repository fail closed', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  mkdirSync(path.join(root, 'nested'))
  for (const cwd of [path.join(root, 'nested'), await fixture(t)] as const) {
    const evidence = await collectEvidence(nodeSpawn, { cwd, baseline })
    assert.equal(assessEvidence(evidence).verdict, 'inconclusive')
    assert.ok(evidence.issues.some((problem: any) => problem.code === 'REPOSITORY_MISMATCH'))
    assert.equal(evidence.diff, '')
  }
})

test('rewritten HEAD is drift rather than a fresh review baseline', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  await git(root, ['checkout', '--orphan', 'rewritten'])
  write(root, 'note.txt', 'rewritten\n')
  await git(root, ['add', '.'])
  await git(root, ['commit', '-m', 'rewritten history'])
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(assessEvidence(evidence).verdict, 'inconclusive')
  assert.ok(evidence.issues.some((problem: any) => problem.code === 'BASELINE_DRIFT'))
})

test('non-git, unborn HEAD, missing and corrupted baselines are incomplete', async t => {
  const plain = temporary(t)
  const nonGit = await captureBaseline(nodeSpawn, { cwd: plain })
  assert.equal(nonGit.complete, false)
  await git(plain, ['init', '-q'])
  assert.equal((await captureBaseline(nodeSpawn, { cwd: plain })).complete, false)
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  const corrupt: any = { ...baseline, head: '0'.repeat(40) }
  assert.ok(validateBaseline(corrupt).some(problem => problem.code === 'BASELINE_CHANGED'))
  for (const value of [null, {}, corrupt, nonGit] as const) {
    const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline: value })
    assert.equal(assessEvidence(evidence).verdict, 'inconclusive')
  }
})

test('diff and command output truncation are explicit incomplete evidence', async t => {
  const root = await fixture(t)
  write(root, 'big.txt', 'a'.repeat(35_000))
  await git(root, ['add', '.'])
  await git(root, ['commit', '-m', 'large text'])
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  write(root, 'big.txt', 'b'.repeat(35_000))
  const evidence = await collectEvidence(nodeSpawn, {
    cwd: root, baseline, commands: ['npm test'], runs: [{ ...passed('npm test'), output: 'x'.repeat(20_001) }],
  })
  assert.ok(evidence.issues.some((problem: any) => problem.code === 'DIFF_TRUNCATED'))
  assert.equal(evidence.runs[0].truncated, true)
  assert.equal(evidence.runs[0].output.length, 20_000)
  assert.equal(enforceEvidenceVerdict('pass', evidence).verdict, 'inconclusive')
})

test('unchanged preexisting excluded files use only opaque metadata; changed secrets stay out of evidence', async t => {
  const root = await fixture(t)
  write(root, '.env.local', 'SECRET_BODY_DO_NOT_CAPTURE')
  write(root, '.npmrc', '_authToken=PRIVATE_AUTH_DO_NOT_CAPTURE')
  write(root, 'existing.png', Buffer.from([0, 1, 2, 255]))
  write(root, 'generated.js', 'x'.repeat(70_000))
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  assert.equal(baseline.complete, true, JSON.stringify(baseline.issues))
  assert.ok(baseline.files.every(file => file.kind === 'opaque' && !Object.hasOwn(file, 'text') && !Object.hasOwn(file, 'hash')))
  assert.doesNotMatch(JSON.stringify(baseline), /SECRET_BODY|PRIVATE_AUTH/)
  write(root, 'note.txt', 'task source edit\n')
  const unchanged = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(assessEvidence(unchanged).verdict, 'ready', JSON.stringify(unchanged.issues))
  assert.deepEqual(unchanged.changes.map((change: any) => change.path), ['note.txt'])
  write(root, '.npmrc', '_authToken=CHANGED_SECRET_DO_NOT_CAPTURE')
  const changed = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(assessEvidence(changed).verdict, 'inconclusive')
  assert.doesNotMatch(renderEvidence('plan', changed), /CHANGED_SECRET|PRIVATE_AUTH|SECRET_BODY|fingerprint/)
})

test('new excluded or binary source files cannot silently pass', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  write(root, 'binary.txt', Buffer.from([0, 1, 2, 255]))
  write(root, '.env.local', 'NEVER_INCLUDE_THIS_SECRET')
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(enforceEvidenceVerdict('pass', evidence).verdict, 'inconclusive')
  assert.doesNotMatch(JSON.stringify(evidence), /NEVER_INCLUDE_THIS_SECRET/)
})

test('symlinked files are never traversed for evidence', async t => {
  const root = await fixture(t)
  const outside = temporary(t)
  write(outside, 'outside.txt', 'OUTSIDE_BODY_DO_NOT_READ')
  symlinkSync(path.join(outside, 'outside.txt'), path.join(root, 'link.txt'))
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  assert.equal(baseline.complete, false)
  assert.doesNotMatch(JSON.stringify(baseline), /OUTSIDE_BODY/)
  assert.equal(readFileSync(path.join(outside, 'outside.txt'), 'utf8'), 'OUTSIDE_BODY_DO_NOT_READ')
})

test('truncated Git plumbing cannot produce complete evidence', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  const truncatedStatus = (spec: any) => {
    if (!spec.argv.includes('status')) return nodeSpawn(spec)
    return { stdout: Readable.from(['?? new.js\0'.repeat(10_000)]), stderr: Readable.from([]), done: Promise.resolve({ exitCode: 0, signal: null }) }
  }
  const evidence = await collectEvidence(truncatedStatus, { cwd: root, baseline })
  assert.equal(assessEvidence(evidence).verdict, 'inconclusive')
  assert.ok(evidence.issues.some((problem: any) => problem.code === 'STATUS_INCOMPLETE'))
})

test('credential-like source content is never stored or sent as text', async t => {
  const root = await fixture(t)
  const privateValue = 'synthetic' + 'CredentialValue0123456789'
  write(root, 'config.json', JSON.stringify({ api_key: privateValue }))
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  assert.equal(baseline.complete, true)
  assert.equal(baseline.files[0].kind, 'opaque')
  assert.equal(JSON.stringify(baseline).includes(privateValue), false)
  write(root, 'config.json', JSON.stringify({ api_key: `${privateValue}changed` }))
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(assessEvidence(evidence).verdict, 'inconclusive')
  assert.equal(JSON.stringify(evidence).includes(privateValue), false)
})

test('evidence Git cannot execute configured clean/process filters', async t => {
  const root = await fixture(t)
  await git(root, ['config', 'filter.fixture.clean', 'touch filter-was-run.txt; cat'])
  await git(root, ['config', 'filter.fixture.required', 'true'])
  write(root, '.gitattributes', '*.txt filter=fixture\n')
  write(root, 'note.txt', 'modified before baseline\n')
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  assert.equal(baseline.complete, true, JSON.stringify(baseline.issues))
  write(root, 'note.txt', 'modified after baseline\n')
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(assessEvidence(evidence).verdict, 'ready', JSON.stringify(evidence.issues))
  assert.equal(existsSync(path.join(root, 'filter-was-run.txt')), false)
})

test('submodule gitlinks are explicitly unsupported without recursive inspection', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  await git(root, ['update-index', '--add', '--cacheinfo', `160000,${baseline.head},nested-module`])
  const after = await captureBaseline(nodeSpawn, { cwd: root })
  assert.equal(after.complete, false)
  assert.ok(after.issues.some(problem => problem.code === 'SUBMODULE_UNSUPPORTED'))
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(assessEvidence(evidence).verdict, 'inconclusive')
})

test('suspect acceptance output is suppressed and cannot satisfy a passing review', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  const privateValue = 'synthetic' + 'CredentialOutput0123456789'
  const evidence = await collectEvidence(nodeSpawn, {
    cwd: root, baseline, commands: ['npm test'],
    runs: [{ ...passed('npm test'), output: `api_key=${privateValue}` }],
  })
  assert.equal(enforceEvidenceVerdict('pass', evidence).verdict, 'inconclusive')
  assert.equal(JSON.stringify(evidence).includes(privateValue), false)
  assert.match(evidence.runs[0].output, /excluded/)
})

test('assume-unchanged and skip-worktree flags cannot hide changed task files', async t => {
  for (const flag of ['--assume-unchanged', '--skip-worktree'] as const) {
    const root = await fixture(t)
    const baseline = await captureBaseline(nodeSpawn, { cwd: root })
    await git(root, ['update-index', flag, 'note.txt'])
    write(root, 'note.txt', 'hidden modification\n')
    const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
    assert.equal(assessEvidence(evidence).verdict, 'inconclusive')
    assert.ok(evidence.issues.some((problem: any) => problem.code === 'HIDDEN_INDEX_PATH'))
  }
})

test('explicit scope rejects ignored and excluded targets, including later private ignore-rule drift', async t => {
  const root = await fixture(t)
  write(root, '.gitignore', 'ignored.js\n')
  write(root, 'ignored.js', 'excluded from Git visibility\n')
  const ignored = await assertVisibleScope(nodeSpawn, { cwd: root, files: ['ignored.js'] })
  assert.ok(ignored.some(problem => problem.code === 'SCOPE_IGNORED'))
  assert.deepEqual(await assertVisibleScope(nodeSpawn, { cwd: root, files: ['new.js'] }), [])
  write(root, '.git/info/exclude', 'new.js\n')
  assert.ok((await assertVisibleScope(nodeSpawn, { cwd: root, files: ['new.js'] })).some(problem => problem.code === 'SCOPE_IGNORED'))
  assert.ok((await assertVisibleScope(nodeSpawn, { cwd: root, files: ['.env.local'] })).some(problem => problem.code === 'SCOPE_UNSUPPORTED'))
})

test('UTF-8 BOM-only changes remain visible in task-relative source hashes', async t => {
  const root = await fixture(t)
  write(root, 'note.txt', '\ufefforiginal\n')
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  assert.equal(baseline.complete, true)
  assert.ok(baseline.files[0].text.startsWith('\ufeff'))
  write(root, 'note.txt', 'original\n')
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(evidence.complete, true)
  assert.equal(evidence.changes.length, 1)
  assert.notEqual(evidence.changes[0].beforeHash, evidence.changes[0].afterHash)
})

test('new staged shadow content is inconclusive even when working text returns to baseline', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  write(root, 'note.txt', 'unreviewed staged shadow\n')
  await git(root, ['add', 'note.txt'])
  write(root, 'note.txt', 'original\n')
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.deepEqual(evidence.changes, [])
  assert.ok(evidence.issues.some((problem: any) => problem.code === 'INDEX_DIVERGENCE'))
  assert.equal(enforceEvidenceVerdict('pass', evidence).verdict, 'inconclusive')
})

test('normal unstaged edits and index matching reviewed working files remain reviewable', async t => {
  const root = await fixture(t)
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  write(root, 'note.txt', 'reviewed task edit\n')
  assert.equal(assessEvidence(await collectEvidence(nodeSpawn, { cwd: root, baseline })).verdict, 'ready')
  await git(root, ['add', 'note.txt'])
  assert.equal(assessEvidence(await collectEvidence(nodeSpawn, { cwd: root, baseline })).verdict, 'ready')
})

test('unchanged preexisting staged shadow metadata does not become a new task failure', async t => {
  const root = await fixture(t)
  write(root, 'note.txt', 'preexisting staged text\n')
  await git(root, ['add', 'note.txt'])
  write(root, 'note.txt', 'preexisting working text\n')
  const baseline = await captureBaseline(nodeSpawn, { cwd: root })
  write(root, 'note.txt', 'reviewed task working edit\n')
  const evidence = await collectEvidence(nodeSpawn, { cwd: root, baseline })
  assert.equal(assessEvidence(evidence).verdict, 'ready', JSON.stringify(evidence.issues))
  assert.match(evidence.diff, /preexisting working text/)
})

function recordEvidence(run: any) {
  return { complete: true, issues: [], commands: ['npm test'], runs: [run] }
}
function passed(command: any) { return { command, exitCode: 0, output: 'passed', truncated: false } }
function write(root: any, file: any, body: any) { writeFileSync(path.join(root, file), body) }
function temporary(t: any) {
  const root = mkdtempSync(path.join(tmpdir(), 'dsh-x-evidence-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}
async function fixture(t: any) {
  const root = temporary(t)
  await git(root, ['init', '-q'])
  await git(root, ['config', 'user.email', 'fixture@example.invalid'])
  await git(root, ['config', 'user.name', 'Evidence fixture'])
  await git(root, ['config', 'core.autocrlf', 'false'])
  write(root, 'note.txt', 'original\n')
  await git(root, ['add', '.'])
  await git(root, ['commit', '-qm', 'fixture'])
  return root
}
function git(cwd: any, args: any) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} -> ${code}`))))
  })
}
function nodeSpawn(spec: any) {
  const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, stdio: ['ignore', 'pipe', 'pipe'], signal: spec.signal })
  return {
    stdout: child.stdout, stderr: child.stderr,
    done: new Promise<any>((resolve, reject) => {
      child.on('error', reject)
      child.on('close', (exitCode, signal) => resolve({ exitCode, signal }))
    }),
  }
}
