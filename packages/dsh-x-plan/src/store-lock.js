import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import path from 'node:path'
import { planError } from './errors.js'

export const runtimeId = randomUUID()
const HOST = hostname()

function lockPath(dir, kind) { return path.join(dir, `.${kind}.lock`) }

export function inspectLock(dir, kind) {
  const file = lockPath(dir, kind)
  let stat
  try { stat = lstatSync(file) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  if (!stat.isFile() || stat.size > 4096) throw planError('LOCK_INVALID', '任务锁无效；需要人工检查，不能自动恢复执行。')
  let lock
  try { lock = JSON.parse(readFileSync(file, 'utf8')) } catch {
    throw planError('LOCK_INVALID', '任务锁损坏；需要人工检查，不能自动恢复执行。')
  }
  if (!lock || typeof lock.token !== 'string' || typeof lock.runtimeId !== 'string' ||
      !Number.isSafeInteger(lock.pid) || lock.pid <= 0 || typeof lock.hostname !== 'string' ||
      typeof lock.startedAt !== 'string') throw planError('LOCK_INVALID', '任务锁元数据无效。')
  return { ...lock, ownerAlive: ownerAlive(lock) }
}

export function acquireLock(dir, kind, options = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (options.operation !== undefined && (typeof options.operation !== 'string' || options.operation.length > 128)) throw planError('LOCK_INVALID', '任务操作标识无效。')
  const file = lockPath(dir, kind)
  const lock = {
    token: randomUUID(), runtimeId, pid: process.pid, hostname: HOST,
    startedAt: new Date().toISOString(),
    ...(typeof options.operation === 'string' ? { operation: options.operation } : {}),
  }
  let fd
  try { fd = openSync(file, 'wx', 0o600) } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const current = inspectLock(dir, kind)
    if (current?.ownerAlive === false) throw planError('RECOVERY_REQUIRED', '上一次任务异常中断；必须确认恢复，不能自动继续。')
    throw planError(kind === 'task' ? 'TASK_BUSY' : 'STORE_BUSY', '当前会话已有任务运行，请等待完成。')
  }
  try {
    writeFileSync(fd, `${JSON.stringify(lock)}\n`, 'utf8')
    fsyncSync(fd)
  } finally { closeSync(fd) }
  return lock
}

export function releaseLock(dir, kind, token) {
  const current = inspectLock(dir, kind)
  if (!current || current.token !== token) throw planError('LOCK_OWNER', '任务锁所有者已变化，拒绝释放。')
  unlinkSync(lockPath(dir, kind))
}

export function retainLock(dir, kind, token, reason) {
  const current = inspectLock(dir, kind)
  if (!current || current.token !== token) throw planError('LOCK_OWNER', '任务锁所有者已变化。')
  if (typeof reason !== 'string' || reason.length === 0 || reason.length > 1024) throw planError('LOCK_INVALID', '保留任务锁必须提供有限的原因。')
  const { ownerAlive: ignored, ...stored } = current
  const value = { ...stored, retained: true, reason, retainedAt: new Date().toISOString() }
  const temporary = `${lockPath(dir, kind)}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`, 'utf8')
    fsyncSync(fd)
  } finally { closeSync(fd) }
  try { renameSync(temporary, lockPath(dir, kind)) } finally {
    try { unlinkSync(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return value
}

export function withStoreLock(dir, callback) {
  const lock = acquireLock(dir, 'store')
  try { return callback() } finally { releaseLock(dir, 'store', lock.token) }
}

export function assertRecoverable(lock, expectedToken) {
  if (!lock || typeof expectedToken !== 'string' || expectedToken !== lock.token) {
    throw planError('RECOVERY_TOKEN', '恢复必须提供当前任务锁的精确标识。')
  }
  if (lock.retained) throw planError('RECOVERY_REQUIRED', '任务可能仍在执行，必须人工确认所有作业停止后处理保留锁。')
  if (lock.ownerAlive !== false) throw planError('TASK_BUSY', '不能确认原任务进程已经退出，拒绝恢复。')
}

function ownerAlive(lock) {
  if (lock.hostname !== HOST) return null
  try { process.kill(lock.pid, 0); return true } catch (error) {
    return error.code === 'ESRCH' ? false : null
  }
}
