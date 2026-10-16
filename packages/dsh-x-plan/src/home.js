import os from 'node:os'
import path from 'node:path'

/**
 * Plan files sit next to the sessions this product actually uses.
 * `DSH_HOME` wins when Desktop or the CLI set it. Otherwise the product home
 * is `~/.dsh-x`, so a stock `~/.dsh` install is left alone.
 * @param {NodeJS.ProcessEnv} env
 */
export function resolveHome(env = process.env) {
  const fromEnv = env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return path.resolve(fromEnv.trim())
  return path.join(os.homedir(), '.dsh-x')
}
