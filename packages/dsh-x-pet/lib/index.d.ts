import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-x-pet";
export declare const inject: string[];
export interface PetConfig {
    /**
     * Directory that holds Codex pets. Defaults to `${CODEX_HOME:-~/.codex}/pets`,
     * the same folder the Codex app reads, so an existing pet shows up unchanged.
     * Set an absolute path to read a different collection; set an empty string to
     * disable local pets and keep only the bundled one.
     */
    codexHome?: string;
    /**
     * `app.asar` of the installed Codex or ChatGPT app. Defaults to the copy in
     * `/Applications`. The built-in pets are read from it and are not shipped
     * with this plugin. Set an empty string to skip them.
     */
    codexApp?: string;
}
declare const PET_LIST = "dsh-x-pet/list";
declare const PET_SELECT = "dsh-x-pet/select";
declare const PET_MOVE = "dsh-x-pet/move";
declare const PET_ATLAS = "dsh-x-pet/atlas";
export declare function apply(ctx: Context, config?: PetConfig): void;
export { PET_ATLAS, PET_LIST, PET_MOVE, PET_SELECT };
