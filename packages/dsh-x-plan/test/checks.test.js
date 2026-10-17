import assert from 'node:assert/strict'
import test from 'node:test'
import { executeChecks, supportsForegroundBash } from '../src/checks.js'

const checks = [
  { id: 'check-1', command: 'npm test', required: true },
  { id: 'check-2', command: 'npm run lint', required: true },
]
const stream = { type: 'object', additionalProperties: true, properties: { text: { type: 'string' }, truncated: { type: 'boolean' } } }
const job = { type: 'object', additionalProperties: true, properties: { id: { type: 'string' }, status: { type: 'string' } } }
const bash = {
  name: 'bash',
  parameters: { command: { type: 'string' }, description: { type: 'string' }, workdir: { type: 'string' }, timeoutMs: { type: 'number' }, run_in_background: { type: 'boolean' } },
  output: { schema: { oneOf: [{ type: 'object', additionalProperties: true, properties: {
    kind: { type: 'string', const: 'foreground' }, cwd: { type: 'string' },
    exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
    signal: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    timedOut: { type: 'boolean' }, aborted: { type: 'boolean' }, stdout: stream, stderr: stream,
  } }] } },
}
const jobKill = {
  name: 'job_kill', parameters: { job_id: { type: 'string' }, reason: { type: 'string' } },
  output: { schema: { type: 'object', additionalProperties: false, properties: { outcome: { type: 'string' }, job } } },
}
const jobOutput = {
  name: 'job_output', parameters: { job_id: { type: 'string' }, wait: { type: 'boolean' }, timeout_ms: { type: 'number' } },
  output: { schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' }, job } } },
}

function fixture(execute = () => success(foreground()), definitions = { bash, job_kill: jobKill, job_output: jobOutput }) {
  const calls = []
  const contexts = []
  let concludes = 0
  const controller = new AbortController()
  const exec = {
    token: Symbol('real-outer-token'), rootCallId: 'outer-call', callId: 'outer-call',
    agent: { id: 'fixture-agent' }, signal: controller.signal,
    deferContext: context => contexts.push(context), concludeTurn: () => { concludes += 1 },
  }
  const ctx = { tools: {
    get(name, agent) { assert.equal(agent, exec.agent); return definitions[name] },
    async execute(input) { calls.push(input); return execute(input) },
  } }
  return { ctx, exec, calls, contexts, controller, definitions, get concludes() { return concludes } }
}

function success(value, fields = {}) { return { isError: false, value, content: [], ...fields } }
function failure(message, code) { return { isError: true, error: { message, ...(code ? { info: { name: 'Error', code } } : {}) }, content: [] } }
function foreground(fields = {}) {
  return {
    kind: 'foreground', cwd: '/work', exitCode: 0, signal: null, timedOut: false, aborted: false,
    stdout: { text: 'all good', truncated: false }, stderr: { text: '', truncated: false }, ...fields,
  }
}
function call(f, fields = {}) { return executeChecks(f.ctx, f.exec, { cwd: '/work', checks, ...fields }) }
function jobState(status, id = 'job-1') { return { id, kind: 'bash', status } }

test('approved checks use the host pipeline with exact parent identity and foreground arguments', async () => {
  const f = fixture()
  const validated = []
  const result = await call(f, { beforeExecute(check) { validated.push(check.id) } })
  assert.deepEqual(validated, ['check-1', 'check-2'])
  assert.deepEqual(result.runs.map(run => run.status), ['passed', 'passed'])
  assert.equal(result.quiescent, true)
  assert.deepEqual(result.jobIds, [])
  assert.equal(new Set(f.calls.map(input => input.callId)).size, 2)
  for (const [index, input] of f.calls.entries()) {
    assert.equal(input.name, 'bash')
    assert.equal(input.rootCallId, f.exec.rootCallId)
    assert.equal(input.parent, f.exec.token)
    assert.equal(input.agent, f.exec.agent)
    assert.equal(input.signal.aborted, false)
    assert.deepEqual(input.arguments, {
      description: `Run approved acceptance check ${checks[index].id}`,
      command: checks[index].command, workdir: '/work', timeoutMs: 120_000, run_in_background: false,
    })
    assert.equal(Object.hasOwn(input.arguments, 'sandbox_permissions'), false)
  }
})

test('run_in_background is omitted when the supported schema lacks it', async () => {
  const definition = structuredClone(bash)
  delete definition.parameters.run_in_background
  const f = fixture(undefined, { bash: definition })
  await call(f)
  assert.equal(Object.hasOwn(f.calls[0].arguments, 'run_in_background'), false)
})

for (const definition of [undefined, { ...bash, output: { schema: { type: 'string' } } }, { ...bash, output: { schema: { type: 'object', properties: { exitCode: { type: 'integer' } } } } }]) {
  test(`unsupported or persistent bash is blocked before execution: ${JSON.stringify(definition?.output?.schema)}`, async () => {
    const f = fixture(undefined, { bash: definition })
    const result = await call(f)
    assert.equal(f.calls.length, 0)
    assert.equal(result.quiescent, true)
    assert.ok(result.runs.every(run => run.status === 'not-run' && run.unavailable))
    assert.equal(supportsForegroundBash(definition), false)
  })
}

test('definition replacement during approval revalidation prevents dispatch', async () => {
  const f = fixture()
  const result = await call(f, { beforeExecute() { f.definitions.bash = { ...bash, output: { schema: { type: 'string' } } } } })
  assert.equal(f.calls.length, 0)
  assert.equal(result.runs[0].status, 'not-run')
})

test('canonical failures are honored without reading a nonexistent value or retrying elsewhere', async () => {
  const f = fixture(() => Object.defineProperty(failure('host approval denied'), 'value', { get() { throw new Error('must never read value on failure') } }))
  const result = await call(f)
  assert.equal(f.calls.length, 1)
  assert.equal(result.runs[0].unavailable, true)
  assert.match(result.runs[0].output, /approval denied/)
  assert.equal(result.runs[1].status, 'not-run')
  assert.equal(result.quiescent, false)
})

test('known pre-dispatch cancellation has no started process', async () => {
  const f = fixture(() => failure('cancelled before body', 'ABORTED_BEFORE_DISPATCH'))
  const result = await call(f)
  assert.equal(result.quiescent, true)
  assert.equal(result.runs[0].unavailable, true)
})

test('nested contexts and authoritative concludesTurn are forwarded without later checks', async () => {
  const context = { source: { kind: 'fixture' }, content: [{ type: 'text', text: 'follow-up context' }] }
  const f = fixture(() => success(foreground(), { additionalContexts: [context], concludesTurn: true }))
  const result = await call(f)
  assert.deepEqual(f.contexts, [context])
  assert.equal(f.concludes, 1)
  assert.equal(f.calls.length, 1)
  assert.equal(result.runs[1].status, 'not-run')
})

test('contexts on failures are also forwarded', async () => {
  const context = { content: [{ type: 'text', text: 'denial context' }] }
  const f = fixture(() => ({ ...failure('denied'), additionalContexts: [context] }))
  await call(f)
  assert.deepEqual(f.contexts, [context])
  assert.equal(f.concludes, 0)
})

for (const fields of [
  { cwd: '/other-work' }, { exitCode: undefined }, { signal: undefined }, { timedOut: undefined },
  { aborted: undefined }, { stdout: { text: 'missing truncation' } }, { stderr: null },
]) {
  test(`incomplete foreground results are inconclusive: ${JSON.stringify(fields)}`, async () => {
    const f = fixture(() => success(foreground(fields)))
    const result = await call(f)
    assert.equal(result.runs[0].status, 'inconclusive')
    assert.equal(result.runs[0].exitCode, null)
    assert.equal(result.quiescent, false)
    assert.equal(f.calls.length, 1)
  })
}

test('nonzero exits and actual foreground timeouts are deterministic failures', async () => {
  const f = fixture(input => success(foreground(input.arguments.command === 'npm test'
    ? { exitCode: 2 } : { exitCode: null, timedOut: true })))
  const result = await call(f)
  assert.deepEqual(result.runs.map(run => run.status), ['failed', 'failed'])
  assert.equal(result.runs[1].timedOut, true)
  assert.equal(result.quiescent, true)
})

for (const fields of [
  { aborted: true, exitCode: 1 }, { signal: 'SIGTERM', exitCode: 1 },
  { sandbox: { denied: true }, exitCode: 1 }, { sandbox: { denied: false, runnerFailed: true }, exitCode: 1 },
  { stopped: 'external cancellation', exitCode: 1 }, { stdout: { text: 'partial', truncated: true } },
]) {
  test(`interruption or output loss cannot count as a pass: ${JSON.stringify(fields)}`, async () => {
    const f = fixture(() => success(foreground(fields)))
    const result = await call(f)
    assert.equal(result.runs[0].status, 'inconclusive')
    assert.equal(result.runs[0].unavailable, true)
    if (!fields.stdout) assert.equal(result.runs[0].exitCode, null)
  })
}

test('combined check output is capped and truncation remains explicit', async () => {
  const f = fixture(() => success(foreground({ stdout: { text: 'x'.repeat(19_000), truncated: false }, stderr: { text: 'y'.repeat(2_000), truncated: false } })))
  const result = await call(f)
  assert.equal(result.runs[0].output.length, 20_000)
  assert.equal(result.runs[0].truncated, true)
  assert.equal(result.runs[0].status, 'inconclusive')
})

test('a promoted job is cancelled and observed terminal through the same host pipeline', async () => {
  const f = fixture(input => {
    if (input.name === 'bash') return success({ kind: 'promoted', cwd: '/work', jobId: 'job-1', output: 'partial' })
    if (input.name === 'job_kill') return success({ outcome: 'cancellation-requested', job: jobState('stopping') })
    if (input.name === 'job_output') return success({ text: '', job: jobState('killed') })
  })
  const result = await call(f)
  assert.deepEqual(f.calls.map(input => input.name), ['bash', 'job_kill', 'job_output'])
  assert.equal(result.quiescent, true)
  assert.deepEqual(result.jobIds, ['job-1'])
  assert.equal(result.runs[0].status, 'inconclusive')
  assert.equal(result.runs[0].timedOut, false)
  assert.equal(result.runs[1].status, 'not-run')
  for (const input of f.calls.slice(1)) {
    assert.equal(input.parent, f.exec.token)
    assert.equal(input.agent, f.exec.agent)
    assert.equal(input.rootCallId, f.exec.rootCallId)
    assert.equal(input.arguments.job_id, 'job-1')
  }
  assert.equal(f.calls[2].arguments.wait, true)
})

for (const value of ['started job abc', { kind: 'promoted', output: 'job id abc' }, { kind: 'background', jobId: '' }]) {
  test(`unknown or unstructured background state stays unquiescent: ${JSON.stringify(value)}`, async () => {
    const f = fixture(() => success(value))
    const result = await call(f)
    assert.equal(result.quiescent, false)
    assert.equal(result.runs[0].status, 'inconclusive')
    assert.equal(f.calls.length, 1)
  })
}

test('missing job cleanup tools never trigger raw-process fallback', async () => {
  const f = fixture(() => success({ kind: 'promoted', jobId: 'job-1' }), { bash })
  const result = await call(f)
  assert.equal(result.quiescent, false)
  assert.deepEqual(result.jobIds, ['job-1'])
  assert.deepEqual(f.calls.map(input => input.name), ['bash'])
})

test('a kill acknowledgement alone is insufficient if the job remains running', async () => {
  const f = fixture(input => input.name === 'bash'
    ? success({ kind: 'promoted', jobId: 'job-1' })
    : input.name === 'job_kill'
      ? success({ outcome: 'cancellation-requested', job: jobState('stopping') })
      : success({ text: '', job: jobState('stopping') }))
  const result = await call(f, { cleanupTimeoutMs: 10 })
  assert.equal(result.quiescent, false)
  assert.match(result.runs[0].error, /仍未确认停止/)
})

test('job observation must identify exactly the spawned bash job', async () => {
  const f = fixture(input => input.name === 'bash'
    ? success({ kind: 'promoted', jobId: 'job-1' })
    : input.name === 'job_kill'
      ? success({ outcome: 'cancellation-requested', job: jobState('stopping') })
      : success({ text: '', job: jobState('killed', 'someone-elses-job') }))
  const result = await call(f)
  assert.equal(result.quiescent, false)
})

test('host denial of cleanup keeps the job unresolved', async () => {
  const f = fixture(input => input.name === 'bash'
    ? success({ kind: 'promoted', jobId: 'job-1' }) : failure('job cleanup not approved'))
  const result = await call(f)
  assert.equal(result.quiescent, false)
  assert.deepEqual(f.calls.map(input => input.name), ['bash', 'job_kill'])
})

test('caller cancellation does not cancel the independent job cleanup signal', async () => {
  let f
  f = fixture(input => {
    if (input.name === 'bash') {
      f.controller.abort()
      return success({ kind: 'promoted', jobId: 'job-1' })
    }
    assert.equal(input.signal.aborted, false)
    if (input.name === 'job_kill') return success({ outcome: 'cancellation-requested', job: jobState('stopping') })
    return success({ text: '', job: jobState('killed') })
  })
  const result = await call(f)
  assert.equal(result.quiescent, true)
  assert.equal(result.runs[0].status, 'inconclusive')
  assert.equal(f.calls.length, 3)
})

test('the independent command deadline is forwarded and the runtime promise is drained', async () => {
  let drained = false
  const f = fixture(async input => {
    await new Promise(resolve => input.signal.addEventListener('abort', resolve, { once: true }))
    await new Promise(resolve => setTimeout(resolve, 10))
    drained = true
    return failure('started command cancelled', 'ABORTED')
  })
  const result = await call(f, { timeoutMs: 10 })
  assert.equal(drained, true)
  assert.equal(result.runs[0].timedOut, true)
  assert.equal(result.runs[0].status, 'failed')
  assert.equal(result.quiescent, false)
  assert.equal(f.calls.length, 1)
})

test('already cancelled calls never execute checks', async () => {
  const f = fixture()
  f.controller.abort()
  const result = await call(f)
  assert.equal(f.calls.length, 0)
  assert.equal(result.quiescent, true)
  assert.ok(result.runs.every(run => run.status === 'not-run'))
})

test('approval revalidation failure prevents execution and remains quiescent', async () => {
  const f = fixture()
  const result = await call(f, { beforeExecute() { throw new Error('approved hash changed') } })
  assert.equal(f.calls.length, 0)
  assert.equal(result.quiescent, true)
  assert.match(result.runs[0].output, /hash changed/)
})

test('invalid approval records fail before shell lookup', async () => {
  const f = fixture()
  for (const invalid of [[{ id: 'a', command: 'npm test' }], [{ id: 'a', command: 'npm test\nrm x', required: true }], [...checks, checks[0]]]) {
    await assert.rejects(call(f, { checks: invalid }), { code: 'DSH_X_PLAN_CHECKS_INVALID' })
  }
  await assert.rejects(executeChecks(f.ctx, { ...f.exec, token: undefined }, { cwd: '/work', checks }), { code: 'DSH_X_PLAN_CHECK_CONTEXT' })
  assert.equal(f.calls.length, 0)
})

test('a timeout cannot look passed even when a backend reports exitCode zero', async () => {
  const f = fixture(() => success(foreground({ timedOut: true, exitCode: 0 })))
  const result = await call(f)
  assert.equal(result.runs[0].status, 'failed')
  assert.equal(result.runs[0].unavailable, true)
})

test('onJob authorizes exactly the observed job before any cleanup tool is dispatched', async () => {
  const registered = new Set()
  let registrations = 0
  const f = fixture(input => {
    if (input.name === 'bash') return success({ kind: 'promoted', jobId: 'job-1' })
    assert.equal(registered.has(input.arguments.job_id), true)
    if (input.name === 'job_kill') return success({ outcome: 'cancellation-requested', job: jobState('stopping') })
    return success({ text: '', job: jobState('killed') })
  })
  const result = await call(f, { onJob(jobId) { registrations += 1; registered.add(jobId) } })
  assert.equal(registrations, 1)
  assert.equal(result.quiescent, true)
})

test('failed onJob registration keeps the known job ID and never bypasses cleanup guards', async () => {
  const f = fixture(() => success({ kind: 'promoted', jobId: 'job-1' }))
  const result = await call(f, { onJob() { throw new Error('ownership registration failed') } })
  assert.deepEqual(result.jobIds, ['job-1'])
  assert.equal(result.quiescent, false)
  assert.equal(f.calls.length, 1)
})

test('the real official ToolRuntime guard still governs nested acceptance checks', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: ToolRuntime, defineTool } = await import('@deepseek-ai/dsh-tools')
  const { default: SystemPrompt } = await import('@deepseek-ai/dsh-system-prompt')
  const ctx = new Context()
  let bodies = 0
  let actualParent
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.tools.register(defineTool({
      ...bash, description: 'Fixture only, never runs a shell',
      output: { schema: bash.output.schema.oneOf[0], render: () => [] },
      async execute(_args, exec) { bodies += 1; assert.equal(exec.parent, actualParent); return foreground() },
    }))
    ctx.tools.register(defineTool({
      name: 'fixture_check_runner', description: 'Run local check protocol fixtures', parameters: {},
      output: { schema: { type: 'object', additionalProperties: true }, render: () => [] },
      async execute(_args, exec) {
        actualParent = exec.token
        return executeChecks(ctx, exec, { cwd: '/work', checks })
      },
    }))
    const dispose = ctx.tools.guard(exec => exec.name === 'bash' ? 'host denied fixture check' : undefined)
    const invoke = () => ctx.tools.execute({ name: 'fixture_check_runner', arguments: {}, callId: crypto.randomUUID(), signal: new AbortController().signal })
    const denied = await invoke()
    assert.equal(denied.isError, false, JSON.stringify(denied))
    assert.equal(bodies, 0)
    assert.equal(denied.value.runs[0].unavailable, true)
    assert.match(denied.value.runs[0].output, /host denied/)
    dispose()
    const allowed = await invoke()
    assert.equal(allowed.isError, false, JSON.stringify(allowed))
    assert.equal(bodies, 2)
    assert.deepEqual(allowed.value.runs.map(run => run.status), ['passed', 'passed'])
  } finally {
    await ctx.fiber.dispose()
  }
})

test('actual compiled job-control definitions clean up only the registered promoted job', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: ToolRuntime, defineTool } = await import('@deepseek-ai/dsh-tools')
  const { default: SystemPrompt } = await import('@deepseek-ai/dsh-system-prompt')
  const ctx = new Context()
  const calls = []
  const registered = new Set()
  let parent
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.tools.register(defineTool({
      ...bash, description: 'Local protocol fixture; starts no process',
      output: { schema: { oneOf: [bash.output.schema.oneOf[0], {
        type: 'object', additionalProperties: false,
        properties: { kind: { type: 'string', const: 'promoted' }, jobId: { type: 'string' } },
      }] }, render: () => [] },
      async execute(args, exec) {
        calls.push('bash')
        assert.equal(args.run_in_background, false)
        assert.equal(exec.parent, parent)
        return { kind: 'promoted', jobId: 'fixture-promoted-job' }
      },
    }))
    for (const definition of [jobKill, jobOutput]) {
      ctx.tools.register(defineTool({
        ...definition, description: 'Local protocol fixture; controls no real job',
        output: { ...definition.output, render: () => [] },
        async execute(args, exec) {
          calls.push(definition.name)
          assert.equal(exec.parent, parent)
          assert.equal(registered.has(args.job_id), true)
          return definition.name === 'job_kill'
            ? { outcome: 'cancellation-requested', job: jobState('stopping', args.job_id) }
            : { text: '', job: jobState('killed', args.job_id) }
        },
      }))
    }
    ctx.tools.register(defineTool({
      name: 'fixture_check_runner', description: 'Run local job protocol fixtures', parameters: {},
      output: { schema: { type: 'object', additionalProperties: true }, render: () => [] },
      async execute(_args, exec) {
        parent = exec.token
        return executeChecks(ctx, exec, { cwd: '/work', checks, onJob: id => registered.add(id) })
      },
    }))
    ctx.tools.guard(exec => ['job_kill', 'job_output'].includes(exec.name)
      && (exec.parent !== parent || !registered.has(exec.arguments.job_id))
      ? 'unregistered job control rejected' : undefined)
    const result = await ctx.tools.execute({
      name: 'fixture_check_runner', arguments: {}, callId: crypto.randomUUID(), signal: new AbortController().signal,
    })
    assert.equal(result.isError, false, JSON.stringify(result))
    assert.equal(result.value.quiescent, true, JSON.stringify(result.value))
    assert.deepEqual(result.value.jobIds, ['fixture-promoted-job'])
    assert.deepEqual(calls, ['bash', 'job_kill', 'job_output'])
    assert.deepEqual(result.value.runs.map(run => run.status), ['inconclusive', 'not-run'])
  } finally {
    await ctx.fiber.dispose()
  }
})
