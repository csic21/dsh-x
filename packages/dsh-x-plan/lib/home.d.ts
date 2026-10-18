/**
 * Plan files sit next to the sessions this product actually uses.
 * `DSH_HOME` wins when Desktop or the CLI set it. Otherwise the product home
 * is `~/.dsh-x`, so a stock `~/.dsh` install is left alone.
 * @param {NodeJS.ProcessEnv} env
 */
export declare function resolveHome(env?: NodeJS.ProcessEnv): string;
