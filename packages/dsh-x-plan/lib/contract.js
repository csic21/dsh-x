import path from 'node:path';
import { realpathSync, lstatSync } from 'node:fs';
import { planError } from './errors.js';
const fail = (message) => { throw planError('CONTRACT', message); };
const string = (value, max = 2000) => typeof value === 'string' && value.trim() !== '' && value.length <= max;
export function parseContract(text) {
    const matches = [...text.matchAll(/```dsh-x-plan\s*\n([\s\S]*?)```/g)];
    if (matches.length !== 1)
        fail('计划必须包含唯一的 dsh-x-plan JSON 契约。');
    let value;
    try {
        value = JSON.parse(matches[0][1]);
    }
    catch {
        fail('计划契约不是有效 JSON。');
    }
    if (!value || value.version !== 1 || !string(value.goal, 1000))
        fail('计划目标或契约版本无效。');
    if (Object.keys(value).some(key => !['version', 'goal', 'files', 'steps', 'questions', 'checks'].includes(key)))
        fail('计划契约包含未知字段。');
    if (!Array.isArray(value.files) || value.files.length > 50 || value.files.some((file) => !validRelative(file)) || new Set(value.files).size !== value.files.length)
        fail('计划文件范围必须是最多50个唯一仓库相对文件路径。');
    if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 30 || value.steps.some((step) => !step || !string(step.id, 40) || !string(step.title, 1000)))
        fail('计划必须有1至30个有标识的步骤。');
    if (new Set(value.steps.map((s) => s.id)).size !== value.steps.length)
        fail('步骤标识不能重复。');
    if (!Array.isArray(value.questions) || value.questions.length > 20 || value.questions.some((q) => !q || !string(q.text, 1000) || typeof q.blocking !== 'boolean'))
        fail('待确认问题格式无效。');
    if (!Array.isArray(value.checks) || value.checks.length > 8 || value.checks.some((check) => !check || !string(check.id, 40) || !string(check.command, 400) || check.command.includes('\n') || check.required !== true))
        fail('验收检查必须明确命令和required:true，最多8项。');
    if (new Set(value.checks.map((c) => c.id)).size !== value.checks.length)
        fail('检查标识不能重复。');
    return { version: 1, goal: value.goal.trim(), files: [...value.files], steps: value.steps.map(({ id, title }) => ({ id, title })), questions: value.questions.map(({ text, blocking }) => ({ text, blocking })), checks: value.checks.map(({ id, command }) => ({ id, command, required: true })) };
}
function validRelative(file) {
    return string(file, 300) && !path.isAbsolute(file) && !file.includes('\\') && !file.split('/').some((p) => p === '' || p === '.' || p === '..') && !file.startsWith('.git/') && file !== '.git' && !/[\x00-\x1f]/.test(file);
}
export function requireReadyContract(contract) {
    if (contract.questions.some((q) => q.blocking))
        throw planError('QUESTIONS_OPEN', '计划仍有阻塞性待确认问题。先修订计划，再申请批准。');
    if (!contract.checks.length)
        throw planError('CHECKS_MISSING', '计划没有可执行验收检查，不能自动批准为可验收任务。请补充检查或保持草稿。');
    return contract;
}
export function pathInContract(cwd, file, contract) {
    if (typeof file !== 'string')
        return false;
    const root = realpathSync(cwd), candidate = path.resolve(root, file);
    if (!contract.files.some((p) => path.resolve(root, p) === candidate))
        return false;
    const relative = path.relative(root, candidate);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        return false;
    let current = root;
    for (const segment of relative.split(path.sep)) {
        current = path.join(current, segment);
        try {
            if (lstatSync(current).isSymbolicLink())
                return false;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return true;
            throw error;
        }
    }
    return true;
}
