import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { planError } from './errors.js';
import { approvalText } from './approval-text.js';
import { assertFamily, defaultReviewer, resolveLaunch } from './agents.js';
import { preflightAcp, runAcpPrompt } from './acp.js';
import { captureBaseline, captureRepositoryIdentity, sameIdentity, assertVisibleScope, readGit } from './baseline.js';
import { collectEvidence, assessEvidence, enforceEvidenceVerdict, renderEvidence, containsCredentialLikeText } from './collect.js';
import { executeChecks, supportsStructuredBash } from './checks.js';
import { parseContract, requireReadyContract, pathInContract } from './contract.js';
import { gateDecision, PLAN_TOOLS, READ_ONLY_DURING_DRAFT } from './gate.js';
import { resolveHome } from './home.js';
import { MAX_CONTEXT_CHARS, PLAN_TIMEOUT_MS } from './limits.js';
import { parseVerdict } from './plan-text.js';
import { LOOP_SECTION, plannerPrompt, reviewerPrompt } from './prompts.js';
import { approvePlan, prepareApproval, discardPlan, currentWorkflow, readWorkflow, readMeta, readApproved, sessionPlansDir, writeNewPlan, replaceDraft, writeReview, taskLockState, withTaskLock, recoverTaskLock, transitionWorkflow, listRounds, } from './store.js';
export const name = 'dsh-x-plan';
export const inject = ['tools', 'workingDirectory', 'subprocess', 'systemPrompt'];
const FAMILIES = ['codex', 'claude', 'grok'];
const roundParameter = { type: 'integer', description: 'Current task round; stale rounds are rejected.' };
export function apply(context) {
    const ctx = context;
    const reviewExecutions = new Map();
    const shellApprovals = new Map();
    const mutationPermits = new Map();
    const activeMutations = new Map();
    const spawn = (spec) => ctx.subprocess.spawn(spec);
    ctx.effect(() => ctx.systemPrompt.section({ name, order: 8000, interpolate: false, text: LOOP_SECTION }), 'dsh-x-plan.section()');
    // Do not short-circuit other policy listeners. Our final guard is deny-only.
    ctx.on('tools/pre-execute', async (exec, next) => {
        const downstream = await next();
        if (downstream?.kind === 'deny' || exec.signal?.aborted)
            return downstream;
        if (exec.name !== 'bash' || reviewExecutions.has(exec.parent))
            return downstream;
        const state = lookup(exec);
        if (!state.workflow || !['approved', 'executing'].includes(state.workflow.state))
            return downstream;
        const approved = readApproved(state.dir, state.workflow.round);
        if (!supportsStructuredBash(ctx.tools.get('bash', exec.agent)))
            throw planError('COMMAND_BACKEND', 'Active tasks require the standard structured foreground bash backend.');
        if (exec.arguments?.run_in_background === true)
            throw planError('COMMAND_SCOPE', 'Background shell work is not supported during an active task.');
        const command = exec.arguments?.command;
        const workdir = exec.arguments?.workdir;
        if (typeof command !== 'string' || !command.trim() || (workdir && realpathSync(path.resolve(approved.binding.cwd, workdir)) !== approved.binding.cwd))
            throw planError('COMMAND_SCOPE', 'Shell command working directory differs from the approved task.');
        await requestApproval(ctx, exec, {
            zh: `当前任务的额外 shell 命令可能修改文件范围之外的内容；此插件不提供操作系统沙箱。仅本次允许？\n目录：${approved.binding.cwd}\n命令：${command}`,
            en: `This additional shell command can change files outside the plan scope; this plugin is not an OS sandbox. Allow this invocation only?\nDirectory: ${approved.binding.cwd}\nCommand: ${command}`,
        });
        shellApprovals.set(exec.token, { arguments: JSON.stringify(exec.arguments), hash: approved.hash });
        return downstream;
    });
    ctx.effect(() => ctx.tools.guard((exec) => {
        try {
            if (PLAN_TOOLS.has(exec.name) || READ_ONLY_DURING_DRAFT.has(exec.name))
                return undefined;
            const { dir, workflow } = lookup(exec);
            if (!dir)
                return undefined;
            const review = reviewExecutions.get(exec.parent);
            if (review && exec.name === 'bash') {
                const approved = readApproved(dir, review.round);
                if (approved.hash !== review.hash || !review.commands.includes(exec.arguments?.command) || exec.arguments?.workdir !== approved.binding.cwd)
                    return 'Acceptance invocation differs from its approved snapshot.';
                return undefined;
            }
            if (review && ['job_kill', 'job_output'].includes(exec.name))
                return review.jobs.has(exec.arguments?.job_id) ? undefined : 'Job is not owned by this acceptance run.';
            const decision = gateDecision({ toolName: exec.name, workflow, locked: Boolean(taskLockState(dir)) });
            if (decision.kind === 'deny')
                return decision.reason;
            if (!workflow)
                return undefined;
            const approved = readApproved(dir, workflow.round);
            const liveCwd = exec.agent?.session && typeof ctx.workingDirectory.get === 'function' ? ctx.workingDirectory.get(exec.agent.session) : approved.binding.cwd;
            if (realpathSync(liveCwd) !== approved.binding.cwd)
                return 'Working directory differs from the approved task.';
            if (exec.name === 'write' || exec.name === 'edit') {
                const file = exec.arguments?.file_path;
                if (typeof file !== 'string' || !pathInContract(approved.binding.baseline.repoRoot, path.resolve(liveCwd, file), approved.manifest))
                    return 'File is outside the approved file scope or traverses an unsafe symlink.';
            }
            else if (exec.name === 'bash') {
                const permit = shellApprovals.get(exec.token);
                shellApprovals.delete(exec.token);
                if (!permit || permit.hash !== approved.hash || permit.arguments !== JSON.stringify(exec.arguments))
                    return 'Shell invocation requires a fresh command-specific approval.';
            }
            mutationPermits.set(exec.token, { round: workflow.round, hash: approved.hash, arguments: JSON.stringify(exec.arguments) });
            if (workflow.state === 'approved')
                transitionWorkflow(dir, workflow.round, 'executing', { expectedState: 'approved' });
            return undefined;
        }
        catch (error) {
            return `Plan safety check blocked this invocation: ${error.message}`;
        }
    }), 'dsh-x-plan.guard()');
    ctx.on('tools/execute', async (exec, next) => {
        const review = reviewExecutions.get(exec.parent);
        if (review && exec.name === 'bash') {
            const approved = readApproved(plansDir(exec), review.round);
            const identity = await captureRepositoryIdentity(spawn, { cwd: await ctx.workingDirectory.ensure(exec.agent, exec.signal), signal: exec.signal });
            if (!identity.complete || !sameIdentity(approved.binding.baseline, identity, { includeHead: false }) || !await descendantHead(approved.binding.baseline, identity, exec) || readApproved(plansDir(exec), review.round).hash !== review.hash || exec.arguments.workdir !== approved.binding.cwd)
                throw planError('BINDING_MISMATCH', 'Acceptance repository changed before command dispatch.');
            return next();
        }
        if (PLAN_TOOLS.has(exec.name) || READ_ONLY_DURING_DRAFT.has(exec.name) || reviewExecutions.has(exec.parent))
            return next();
        const { dir, workflow } = lookup(exec);
        if (!dir)
            return next();
        if (!workflow) {
            if (taskLockState(dir))
                throw planError('TASK_BUSY', 'A planning operation is already running.');
            const active = activeMutations.get(dir) ?? new Set();
            active.add(exec.token);
            activeMutations.set(dir, active);
            try {
                const result = await next();
                if (exec.name === 'bash' && ['promoted', 'background'].includes(result.value?.kind))
                    await withTaskLock(dir, async (lock) => lock.retain(`preexisting_background_job:${String(result.value?.jobId ?? result.value?.job_id ?? 'unknown').slice(0, 128)}`), { operation: 'background-fence' });
                return result;
            }
            finally {
                active.delete(exec.token);
                if (!active.size)
                    activeMutations.delete(dir);
            }
        }
        const permit = mutationPermits.get(exec.token);
        mutationPermits.delete(exec.token);
        if (!permit)
            throw planError('STATE_CONFLICT', 'Mutation has no validated task permit.');
        return withTaskLock(dir, async (lock) => {
            const approved = readApproved(dir, permit.round);
            const state = readWorkflow(dir, permit.round);
            if (approved.hash !== permit.hash || !['approved', 'executing'].includes(state.state) || permit.arguments !== JSON.stringify(exec.arguments))
                throw planError('STATE_CONFLICT', 'Task changed before mutation dispatch.');
            const identity = await captureRepositoryIdentity(spawn, { cwd: await ctx.workingDirectory.ensure(exec.agent, exec.signal), signal: exec.signal });
            const sameRepo = identity.complete && sameIdentity(approved.binding.baseline, identity, { includeHead: false });
            const descendant = sameRepo && (identity.head === approved.binding.baseline.head || (await readGit(spawn, identity.repoRoot, ['merge-base', '--is-ancestor', approved.binding.baseline.head, identity.head], exec.signal)).ok);
            const liveCwd = exec.agent?.session && typeof ctx.workingDirectory.get === 'function' ? ctx.workingDirectory.get(exec.agent.session) : identity.cwd;
            const validPath = !['write', 'edit'].includes(exec.name) || pathInContract(approved.binding.baseline.repoRoot, path.resolve(liveCwd, exec.arguments.file_path), approved.manifest);
            if (!sameRepo || !descendant || realpathSync(liveCwd) !== approved.binding.cwd || !validPath) {
                transitionWorkflow(dir, permit.round, 'needs_user', { reason: 'repository_changed', expectedState: state.state });
                throw planError('BINDING_MISMATCH', 'Repository identity, ancestry, cwd or file scope changed before execution. Inspect and replan.');
            }
            if (readApproved(dir, permit.round).hash !== permit.hash || permit.arguments !== JSON.stringify(exec.arguments))
                throw planError('STATE_CONFLICT', 'Approval changed during execution preparation.');
            try {
                const result = await next();
                if (exec.name === 'bash' && (result.isError || result.value?.kind !== 'foreground'))
                    lock.retain(`shell_quiescence_unconfirmed:${String(result.value?.jobId ?? result.value?.job_id ?? 'unknown').slice(0, 128)}`);
                return result;
            }
            catch (error) {
                if (exec.name === 'bash')
                    lock.retain('shell_quiescence_unconfirmed');
                throw error;
            }
        }, { operation: 'execution' });
    });
    ctx.on('tools/result', (exec) => { shellApprovals.delete(exec.token); mutationPermits.delete(exec.token); });
    const planParameters = {
        goal: { type: 'string', required: true, description: 'Concrete user outcome.' },
        planner: { type: 'string', required: true, enum: FAMILIES },
        reviewer: { type: 'string', enum: FAMILIES, description: 'Optional different family, checked before planning.' },
        context: { type: 'string', description: 'Relevant excerpts only. Never include credentials.' },
        language: { type: 'string', enum: ['zh', 'en'], description: 'Language of generated plan; user content is not translated by the UI.' },
    };
    register('dsh_x_plan', 'plan', 'Create a read-only external plan with a structured contract. Preflight both planner and reviewer; no writes until immutable approval.', planParameters, (args, exec) => makePlan(args, exec, false));
    register('dsh_x_revise_plan', 'revise', 'Replace only the current unapproved draft with a new draft, preserving the old round. Approved tasks must first be explicitly discarded.', { ...planParameters, round: roundParameter }, (args, exec) => makePlan(args, exec, true));
    async function makePlan(args, exec, revise) {
        const dir = plansDir(exec);
        return withSessionTaskLock(dir, async () => {
            const active = currentWorkflow(dir);
            if (revise ? !active || active.state !== 'draft' || (args.round !== undefined && args.round !== active.round) : active !== null)
                throw planError('DRAFT_EXISTS', 'Inspect the active task; only an unapproved draft can be revised. Complete or explicitly discard other active tasks.');
            const planner = assertFamily(args.planner, 'planner');
            const reviewer = assertFamily(args.reviewer ?? defaultReviewer(planner), 'reviewer');
            if (planner === reviewer)
                throw planError('SAME_FAMILY', 'Planner and reviewer must be different families.');
            const goal = args.goal.trim();
            if (!goal || goal.length > 1000)
                throw planError('GOAL_EMPTY', 'Goal must contain 1–1000 characters.');
            const context = args.context ?? '';
            if (containsCredentialLikeText(context) || containsCredentialLikeText(goal))
                throw planError('SECRET_CONTENT', 'Possible credentials were detected. Remove them before sending context to an external adapter.');
            if (context.length > MAX_CONTEXT_CHARS)
                throw planError('CONTEXT_SIZE', 'Context is too large; include only relevant excerpts.');
            const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
            const baseline = await captureBaseline(spawn, { cwd, signal: exec.signal });
            if (!baseline.complete)
                throw planError('BASELINE_INCOMPLETE', baseline.issues.map(issue => issue.message).join('\n'));
            const launches = { planner: await launch(planner, exec), reviewer: await launch(reviewer, exec) };
            const adapters = {};
            for (const role of ['planner', 'reviewer']) {
                const result = await preflightAcp(acpOptions(launches[role], cwd, exec));
                if (!result.ok)
                    throw planError('PREFLIGHT_FAILED', `${role}: ${failureText(result)}`);
                adapters[role] = result.adapter;
            }
            const previous = revise ? readFileSync(path.join(dir, `plan-${active.round}.md`), 'utf8') : '';
            const result = await runSafePrompt({ ...acpOptions(launches.planner, cwd, exec), expectedAdapter: adapters.planner, prompt: plannerPrompt({ goal, context: previous ? `${context}\n\nPrevious unapproved draft (revise using the new goal):\n${previous}` : context, language: args.language }) });
            if (!result.ok)
                throw planError('PLAN_FAILED', failureText(result));
            if (containsCredentialLikeText(result.text))
                throw planError('SECRET_CONTENT', 'Possible credentials in adapter output were withheld; inspect the adapter locally.');
            const manifest = parseContract(result.text);
            await visibleScope(cwd, manifest, exec);
            const after = await captureBaseline(spawn, { cwd, signal: exec.signal });
            if (!after.complete || after.digest !== baseline.digest)
                throw planError('PLAN_WORKSPACE_CHANGED', 'Workspace changed during read-only planning. No executable plan was created; inspect changes before retrying.');
            const record = { planner, reviewer, cwd, baseline, manifest, adapters, text: result.text };
            const written = revise ? replaceDraft(dir, active.round, record) : writeNewPlan(dir, record);
            return taskValue(dir, written.round, { path: written.path, body: written.text, text: written.text, reason: 'draft_ready' });
        }, { operation: 'planning' });
    }
    register('dsh_x_approve_plan', 'approve', 'Request official user approval for an immutable revision, content hash, repository baseline, file scope and check commands. Approval fails if the draft or workspace changes while waiting.', { round: roundParameter }, async (args, exec) => {
        const dir = plansDir(exec);
        return withSessionTaskLock(dir, async () => {
            const state = requireCurrent(dir, args.round);
            if (!['draft', 'needs_user'].includes(state.state))
                throw planError('ALREADY_APPROVED', 'This task is not awaiting approval.');
            const meta = readMeta(dir, state.round);
            if (!meta.binding?.baseline || !meta.adapters)
                throw planError('REAPPROVAL_REQUIRED', 'Legacy tasks must be discarded and replanned with the new contract and adapter preflight.');
            const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
            const current = await captureBaseline(spawn, { cwd, signal: exec.signal });
            if (!current.complete || !sameIdentity(meta.binding.baseline, current, { includeHead: false }) || !await descendantHead(meta.binding.baseline, current, exec))
                throw planError('BINDING_MISMATCH', 'Current repository does not match the task baseline.');
            if (!state.everApproved && current.digest !== meta.binding.baseline.digest)
                throw planError('BASELINE_CHANGED', 'Workspace changed after planning; revise the draft before approving.');
            const manifest = requireReadyContract(parseContract(readFileSync(path.join(dir, `plan-${state.round}.md`), 'utf8')));
            await visibleScope(cwd, manifest, exec);
            const captured = prepareApproval(dir, state.round, { cwd, baseline: meta.binding.baseline, manifest });
            const display = approvalText({ toolName: exec.name, snapshot: captured });
            if (state.state === 'needs_user') {
                display.zh += '\n\n这是中断或未通过后的重新批准。保留原始任务基线；现有改动不会撤销。';
                display.en += '\n\nThis reapproves interrupted or unsuccessful work. The original baseline remains; existing changes are not undone.';
            }
            await requestApproval(ctx, exec, display);
            const after = await captureBaseline(spawn, { cwd: await ctx.workingDirectory.ensure(exec.agent, exec.signal), signal: exec.signal });
            if (!after.complete || after.digest !== current.digest)
                throw planError('APPROVAL_STALE', 'Workspace changed while approval was pending. Review and approve again.');
            await visibleScope(cwd, manifest, exec);
            const approved = approvePlan(dir, state.round, { token: captured.token, expectedHash: captured.hash, expectedRevision: captured.revision });
            return taskValue(dir, state.round, { path: approved.path, body: approved.text, text: approved.text });
        }, { operation: 'approval' });
    });
    register('dsh_x_discard_plan', 'discard', 'Explicitly abandon the active task through official approval. This never reverts file changes.', { round: roundParameter }, async (args, exec) => {
        const dir = plansDir(exec);
        return withSessionTaskLock(dir, async () => {
            const state = requireCurrent(dir, args.round);
            await requestApproval(ctx, exec, approvalText({ toolName: exec.name, discard: state }));
            const current = requireCurrent(dir, state.round);
            if (current.hash !== state.hash || current.state !== state.state)
                throw planError('STATE_CONFLICT', 'Task changed while awaiting abandonment approval.');
            const result = discardPlan(dir, state.round);
            return taskValue(dir, state.round, { ...result, text: 'Task abandoned. Existing file changes have not been reverted.' });
        }, { operation: 'discard' });
    });
    register('dsh_x_plan_status', 'status', 'Read the current task state, immutable approval and latest evidence. Does not resume execution.', { round: roundParameter }, async (args, exec) => {
        const dir = plansDir(exec);
        const lastRound = listRounds(dir).at(-1);
        const state = args.round === undefined ? currentWorkflow(dir) ?? (lastRound ? readWorkflow(dir, lastRound) : null) : readWorkflow(dir, args.round);
        if (!state)
            return { text: 'No active plan.', workflowState: 'none' };
        return taskValue(dir, state.round, { text: JSON.stringify({ round: state.round, revision: state.revision, state: state.state, goal: state.goal, planner: state.planner, reviewer: state.reviewer, hash: state.hash, reason: state.reason, latestReview: state.latestReview }, null, 2), reason: taskLockState(dir) ? 'operation_locked' : state.reason });
    });
    register('dsh_x_recover_plan', 'recover', 'After official user approval, release only a demonstrably dead same-host operation lock. Execution remains blocked pending fresh approval. Does not terminate a live process or undo files.', {}, async (_args, exec) => {
        const dir = plansDir(exec);
        const lock = taskLockState(dir);
        if (!lock || lock.ownerAlive !== false)
            throw planError('RECOVERY_UNSAFE', 'No demonstrably dead local operation lock is available for recovery.');
        await requestApproval(ctx, exec, { zh: '释放已确认停止的任务锁，并要求重新检查和批准。不会撤销文件，也不会自动继续执行。', en: 'Release the confirmed dead task lock and require renewed inspection and approval. This does not undo files or resume execution.' });
        const result = recoverTaskLock(dir, { expectedToken: lock.token });
        return result.state ? taskValue(dir, result.state.round, { text: 'Interrupted lock released. Inspect work and obtain a fresh approval.' }) : { text: 'Interrupted lock released; no active task.', workflowState: 'none' };
    });
    register('dsh_x_review', 'review', 'Run mandatory acceptance checks through the official permission chain, then request read-only model review. Commands can write artifacts. Failed checks cannot pass; incomplete evidence is inconclusive. Two failures require renewed user approval.', { round: roundParameter }, async (args, exec) => {
        const dir = plansDir(exec);
        return withSessionTaskLock(dir, async (lock) => {
            const state = requireCurrent(dir, args.round);
            if (!['approved', 'executing'].includes(state.state))
                throw planError('REVIEW_STATE', 'Task is not approved for review. Inspect state and obtain renewed approval when required.');
            const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
            const approved = readApproved(dir, state.round, { cwd });
            const identity = await captureRepositoryIdentity(spawn, { cwd, signal: exec.signal });
            if (!identity.complete || !sameIdentity(approved.binding.baseline, identity, { includeHead: false }) || !await descendantHead(approved.binding.baseline, identity, exec))
                throw planError('BINDING_MISMATCH', 'Review repository differs from the approved task.');
            const manifest = requireReadyContract(approved.manifest);
            await visibleScope(cwd, manifest, exec);
            const reviewer = approved.meta.reviewer;
            const reviewerLaunch = await launch(reviewer, exec);
            const preflight = await preflightAcp(acpOptions(reviewerLaunch, cwd, exec));
            if (!preflight.ok || JSON.stringify(preflight.adapter) !== JSON.stringify(approved.meta.adapters?.reviewer))
                throw planError('REVIEW_PREFLIGHT', preflight.ok ? 'Reviewer adapter differs from the plan-time version. Replan before using a changed adapter.' : failureText(preflight));
            await requestApproval(ctx, exec, {
                zh: `执行第 ${state.round} 轮版本 ${approved.revision} 的验收命令？命令可能写入工作区或测试产物，仍须宿主权限批准。模型审查只读。\n目录：${cwd}\n${manifest.checks.map((check) => check.command).join('\n')}`,
                en: `Run acceptance commands for round ${state.round}, revision ${approved.revision}? Commands may write workspace files or test artifacts and remain subject to host permissions. Model review is read-only.\nDirectory: ${cwd}\n${manifest.checks.map((check) => check.command).join('\n')}`,
            });
            readApproved(dir, state.round, { cwd: await ctx.workingDirectory.ensure(exec.agent, exec.signal) });
            await assertCurrentRepository(approved, exec);
            transitionWorkflow(dir, state.round, 'reviewing', { expectedState: state.state });
            reviewExecutions.set(exec.token, { round: state.round, hash: approved.hash, commands: manifest.checks.map((check) => check.command), jobs: new Set() });
            let runs;
            try {
                const checked = await executeChecks(ctx, exec, { cwd, checks: manifest.checks, onJob: (jobId) => reviewExecutions.get(exec.token)?.jobs.add(jobId), beforeExecute: async () => {
                        const current = readApproved(dir, state.round, { cwd: await ctx.workingDirectory.ensure(exec.agent, exec.signal) });
                        await assertCurrentRepository(approved, exec);
                        if (current.hash !== approved.hash || current.state !== 'reviewing')
                            throw planError('STATE_CONFLICT', 'Approval changed before check execution.');
                    } });
                runs = checked.runs;
                if (!checked.quiescent) {
                    const verdict = checked.runs.some(run => run.timedOut || Number.isInteger(run.exitCode) && run.exitCode !== 0) ? 'fail' : 'inconclusive';
                    const checks = checked.runs.map(run => ({ id: run.id, command: run.command, status: run.timedOut || Number.isInteger(run.exitCode) && run.exitCode !== 0 ? 'failed' : 'inconclusive', exitCode: run.exitCode }));
                    let written;
                    try {
                        written = writeReview(dir, { round: state.round, reviewer, verdict, gaps: `Acceptance work is not confirmed stopped. Inspect these jobs in the host job manager: ${(checked.jobIds ?? []).join(', ') || 'unknown job'}. The task remains locked until manual inspection confirms all jobs ended.`, evidence: { checks, issues: [{ code: 'JOB_NOT_QUIESCENT', message: `Job termination is unconfirmed: ${(checked.jobIds ?? []).join(', ') || 'unknown'}.` }], changes: [] } });
                    }
                    finally {
                        lock.retain(`acceptance_job_not_quiescent:${(checked.jobIds ?? []).join(',').slice(0, 512)}`);
                    }
                    return taskValue(dir, state.round, { verdict, attempt: written.attempt, path: written.path, text: written.text, checks });
                }
            }
            finally {
                reviewExecutions.delete(exec.token);
            }
            await visibleScope(cwd, manifest, exec);
            const evidence = await collectEvidence(spawn, { cwd, baseline: approved.binding.baseline, commands: manifest.checks.map((check) => check.command), runs, signal: exec.signal });
            const outside = evidence.changes.filter((change) => !manifest.files.includes(change.path));
            let verdict = assessEvidence(evidence);
            if (outside.length)
                verdict = { verdict: 'fail', gaps: `Changes outside the approved file scope: ${outside.map((change) => change.path).join(', ')}\n${verdict.gaps}` };
            let body = '';
            if (verdict.verdict === 'ready') {
                const result = await runSafePrompt({ ...acpOptions(reviewerLaunch, cwd, exec), expectedAdapter: approved.meta.adapters.reviewer, prompt: reviewerPrompt({ planner: approved.meta.planner, reviewer, evidence: renderEvidence(approved.text, evidence) }) });
                body = result.text ?? '';
                if (containsCredentialLikeText(body)) {
                    body = '';
                    result.ok = false;
                    result.stopReason = 'sensitive-output-withheld';
                    result.text = '';
                }
                verdict = result.ok ? enforceEvidenceVerdict(parseVerdict(body), evidence) : { verdict: 'inconclusive', gaps: failureText(result) };
            }
            // Model output is about the captured tree, not arbitrary subsequent edits.
            await visibleScope(cwd, manifest, exec);
            const after = await collectEvidence(spawn, { cwd, baseline: approved.binding.baseline, commands: manifest.checks.map((check) => check.command), runs, signal: exec.signal });
            if (verdict.verdict === 'pass' && (!after.complete || JSON.stringify(after.changes) !== JSON.stringify(evidence.changes) || after.currentHead !== evidence.currentHead))
                verdict = { verdict: 'inconclusive', gaps: 'Workspace changed during model review; the evidence no longer describes the current tree.' };
            const checks = manifest.checks.map((check, index) => {
                const run = evidence.runs[index];
                const failed = run?.timedOut || Number.isInteger(run?.exitCode) && run.exitCode !== 0;
                const passed = run?.exitCode === 0 && !run.unavailable && !run.truncated && !run.signal && !run.error;
                return { ...check, status: failed ? 'failed' : passed ? 'passed' : run ? 'inconclusive' : 'not-run', exitCode: run?.exitCode ?? null };
            });
            const written = writeReview(dir, { round: state.round, reviewer, verdict: verdict.verdict, gaps: verdict.gaps, evidence: { checks, issues: evidence.issues, changes: evidence.changes, head: evidence.currentHead ?? null } });
            return taskValue(dir, state.round, { verdict: verdict.verdict, attempt: written.attempt, path: written.path, body, text: verdict.gaps || 'Acceptance passed.', checks });
        }, { operation: 'reviewing' });
    });
    async function assertCurrentRepository(approved, exec) {
        const identity = await captureRepositoryIdentity(spawn, { cwd: await ctx.workingDirectory.ensure(exec.agent, exec.signal), signal: exec.signal });
        if (!identity.complete || !sameIdentity(approved.binding.baseline, identity, { includeHead: false }) || !await descendantHead(approved.binding.baseline, identity, exec))
            throw planError('BINDING_MISMATCH', 'Repository identity or history differs from the approved task.');
        return identity;
    }
    async function descendantHead(baseline, identity, exec) {
        return identity.head === baseline.head || (await readGit(spawn, identity.repoRoot, ['merge-base', '--is-ancestor', baseline.head, identity.head], exec.signal)).ok;
    }
    async function visibleScope(cwd, manifest, exec) {
        const issues = await assertVisibleScope(spawn, { cwd, files: manifest.files, signal: exec.signal });
        if (issues.length)
            throw planError('SCOPE_UNSUPPORTED', issues.map(issue => issue.message).join('\n'));
    }
    function withSessionTaskLock(dir, callback, options) {
        return withTaskLock(dir, async (lock) => {
            if (activeMutations.get(dir)?.size)
                throw planError('TASK_BUSY', 'An earlier mutation is still running. Wait for it to finish before planning or reviewing.');
            return callback(lock);
        }, options);
    }
    async function runSafePrompt(options) {
        if (containsCredentialLikeText(options.prompt))
            throw planError('SECRET_CONTENT', 'Possible credentials were detected in the final adapter input. Remove sensitive content before continuing.');
        return runAcpPrompt(options);
    }
    function register(toolName, operation, description, parameters, execute) {
        ctx.tools.register(defineTool({ name: toolName, description, parameters, output: { schema: { type: 'object', additionalProperties: true, properties: { text: { type: 'string' } } }, presentationMeta: (_args, value) => ({ kind: 'dsh-x-plan.result', version: 2, operation, ...value }), render: (_args, value) => [{ type: 'text', text: value.text ?? '' }] }, execute }));
    }
    function lookup(exec) {
        if (!exec.agent?.id)
            return { dir: null, workflow: null };
        const dir = plansDir(exec);
        return { dir, workflow: currentWorkflow(dir) };
    }
    async function launch(family, exec) { return resolveLaunch(family, { resolveExecutable: (command, env, signal) => ctx.subprocess.resolveExecutable(command, env, signal), signal: exec.signal }); }
    function acpOptions(launch, cwd, exec) { return { spawn, ...launch, cwd, signal: exec.signal, timeoutMs: PLAN_TIMEOUT_MS }; }
}
export async function requestApproval(ctx, exec, displayReason) {
    exec.signal?.throwIfAborted();
    const service = ctx.get('approval');
    if (!service || typeof service.request !== 'function')
        throw planError('APPROVAL_UNAVAILABLE', 'Official approval service is unavailable; no permission was granted.');
    const result = await service.request({ agent: exec.agent, toolName: exec.name, callId: exec.callId ?? randomUUID(), reason: displayReason.en, displayReason, signal: exec.signal });
    exec.signal?.throwIfAborted();
    if (result !== 'allowed-once')
        throw planError('APPROVAL_DENIED', `Official approval was not granted (${result}).`);
}
function plansDir(exec) {
    if (typeof exec.agent?.id !== 'string' || !exec.agent.id)
        throw planError('NO_SESSION', 'A current DSH session is required.');
    return sessionPlansDir(resolveHome(), exec.agent.id);
}
function requireCurrent(dir, round) {
    const state = currentWorkflow(dir);
    if (!state)
        throw planError('NO_TASK', 'No active plan.');
    if (round !== undefined && state.round !== round)
        throw planError('WRONG_ROUND', 'The requested round is not the current task.');
    return state;
}
function taskValue(dir, round, extra = {}) {
    const state = readWorkflow(dir, round);
    const manifest = state.manifest ?? {};
    const review = state.latestReview?.revision === state.revision ? state.latestReview : null;
    return { round, revision: state.revision, path: state.approval ? path.join(dir, `plan-${round}.approved-${state.approval.revision}.md`) : path.join(dir, `plan-${round}.md`), body: '', attempt: review?.attempt ?? 0, verdict: review?.verdict ?? null, hash: state.hash ?? '', workflowState: state.state, goal: state.goal ?? '', planner: state.planner, reviewer: state.reviewer, files: manifest.files ?? [], steps: manifest.steps ?? [], questions: manifest.questions ?? [], checks: review?.evidence?.checks ?? (manifest.checks ?? []).map((check) => ({ ...check, status: 'not-run', exitCode: null })), reason: state.reason ?? '', ...extra };
}
function failureText(result) { if (containsCredentialLikeText(`${result.error ?? ''} ${result.text ?? ''}`))
    return 'Sensitive adapter diagnostic withheld. Inspect it locally before continuing.'; return `Adapter operation did not complete (${result.stopReason ?? 'unknown'}). ${result.error ?? ''} ${(result.text ?? '').slice(0, 2000)}`.trim(); }
