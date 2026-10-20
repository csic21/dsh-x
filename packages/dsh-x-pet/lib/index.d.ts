import type { Context } from '@deepseek-ai/cordis';
/** The slice of a live Session this plugin reads. */
interface LiveSession {
    readonly id?: string;
    seq?: number;
    snapshotEvents(from?: number): readonly {
        type: string;
        seq?: number;
        time?: number;
        data?: unknown;
    }[];
}
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
declare const PET_ACTIVITY = "dsh-x-pet/activity";
/** The detached window's document and the facts it polls. */
declare const PET_FRAME = "dsh-x-pet/frame";
declare const PET_STATE = "dsh-x-pet/state";
/** What a running conversation is doing right now, in one short word. */
export interface SessionActivity {
    phase: 'tool' | 'thinking' | 'working';
    /** The tool currently executing, when one is in flight. */
    tool: string | null;
    step: number | null;
}
/**
 * Read the tail of a session log and name the step it is on. A tool whose
 * result has not been written yet is still running; anything else is the model
 * thinking. Unknown or unreadable logs degrade to the generic phase.
 */
export declare function readActivity(session: LiveSession): SessionActivity;
export declare function apply(ctx: Context, config?: PetConfig): void;
export { PET_ACTIVITY, PET_ATLAS, PET_FRAME, PET_LIST, PET_MOVE, PET_SELECT, PET_STATE };
