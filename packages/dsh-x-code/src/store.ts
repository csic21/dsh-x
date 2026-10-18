import { HarnessError } from '@deepseek-ai/dsh-llm'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, lstatSync, realpathSync, existsSync, openSync, closeSync } from 'node:fs'
import path from 'node:path'
/** Durable storage failure that carries a routable Code error code. */
export class CodeError extends HarnessError { constructor(code: string, message: string) { super(message, code) } }
export const fail = (code: string, message: string): CodeError => new CodeError(code, message)
export const hash = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
export function sessionId(value: unknown): string { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value)) throw fail('CODE_SESSION','Invalid session.'); return value }
/** The durable per-session review document; the record type is the caller's contract. */
export interface ReviewData<T = Record<string, unknown>> {
  version: number
  scope: string
  sessionId: string
  revision: number
  reviews: T[]
}
/** Bounded per-session review storage rooted in one profile. */
export interface ReviewStore<T = Record<string, unknown>> {
  scope: string
  read(id: string): ReviewData<T>
  mutate(id: string, fn: (value: ReviewData<T>) => void): ReviewData<T>
}
export function createReviewStore<T = Record<string, unknown>>(profile: string): ReviewStore<T> {
  if (!path.isAbsolute(profile ?? '')) throw fail('CODE_PROFILE','An absolute profile is required.')
  const root = path.join(realpathSync(profile), '.dsh-x-code')
  mkdirSync(root, {recursive:true,mode:0o700})
  if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== root) throw fail('CODE_STORE','Review storage must not be a symbolic link.')
  // Stored JSON re-enters as untrusted input; every reader validates the fields it uses.
  function readJson(file: string, max = 4_000_000): unknown { const stat=lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw fail('CODE_STORE','Invalid review storage.'); return JSON.parse(readFileSync(file,'utf8')) }
  const scopePath = path.join(root, 'scope.json')
  try { writeFileSync(scopePath, JSON.stringify({scope:randomUUID()}), {flag:'wx',mode:0o600}) } catch(error) { if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error }
  // The pattern admits only 36 hex/dash characters, so a match is a string.
  const scope=(readJson(scopePath,1024) as {scope?: unknown}).scope as string
  if (!/^[a-f0-9-]{36}$/.test(scope))throw fail('CODE_STORE','Invalid profile scope.')
  const fileOf = (id: string): string => path.join(root, hash(sessionId(id))+'.json')
  const read = (id: string): ReviewData<T> => {
    const file=fileOf(id)
    if(!existsSync(file)) return {version:1,scope,sessionId:id,revision:0,reviews:[]}
    const value=readJson(file) as ReviewData<T>
    if(value.version!==1||value.scope!==scope||value.sessionId!==id||!Number.isSafeInteger(value.revision)||!Array.isArray(value.reviews))throw fail('CODE_STORE','Invalid stored reviews.')
    return value
  }
  function mutate(id: string,fn: (value: ReviewData<T>) => void): ReviewData<T> {
    const file=fileOf(id), lock=file+'.lock'; let fd: number
    try { fd=openSync(lock,'wx',0o600) } catch(error){ if((error as NodeJS.ErrnoException).code==='EEXIST')throw fail('CODE_BUSY','Review storage is locked. Another host may be writing; if a host crashed, close all hosts before recovering its stale lock. No lock was removed automatically.');throw error }
    let temp: string | undefined
    try {
      const value=read(id); fn(value); value.revision++
      if(value.reviews.length>30) value.reviews=value.reviews.slice(-30)
      let raw=JSON.stringify(value)
      while(Buffer.byteLength(raw)>4_000_000&&value.reviews.length>1){value.reviews.shift();raw=JSON.stringify(value)}
      if(Buffer.byteLength(raw)>4_000_000)throw fail('CODE_STORE','Review history exceeds its storage limit.')
      temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,raw,{flag:'wx',mode:0o600});renameSync(temp,file);return value
    } finally { if(temp)try{unlinkSync(temp)}catch{};closeSync(fd);unlinkSync(lock) }
  }
  return {scope,read,mutate}
}
