/**
 * Plan files sit next to the sessions this product actually uses.
 * `DSH_HOME` wins when Desktop or the CLI set it. Otherwise use the official
 * native home `~/.dsh`, exactly like the kernel.
 * @param {NodeJS.ProcessEnv} env
 */
export declare function resolveHome(env?: NodeJS.ProcessEnv): string;
