/** Every action any backend may implement; a backend exposes a bounded subset. */
export declare const ACTIONS: readonly ['observe', 'navigate', 'click', 'type', 'scroll', 'press', 'back', 'forward', 'reload', 'select', 'read', 'screenshot'];
export type Action = (typeof ACTIONS)[number];
/** Actions the embedded webview backend implements today; the model-facing protocol stays this small. */
export declare const EMBEDDED_ACTIONS: readonly ["observe", "navigate", "click", "type", "scroll", "press", "back", "forward", "reload"];
export type EmbeddedAction = (typeof EMBEDDED_ACTIONS)[number];
/** Actions the CDP backend exposes to the model today; `read` and `screenshot` stay internal. */
export declare const CDP_ACTIONS: readonly ["observe", "navigate", "click", "type", "scroll", "press", "back", "forward", "reload", "select"];
export type CdpAction = (typeof CDP_ACTIONS)[number];
/** Admitted payload fields, navigation semantics and mutation intent per action. */
export interface ActionSpec {
    readonly fields: readonly string[];
    readonly navigation: boolean;
    readonly mutates: boolean;
}
export declare const ACTION_SPEC: Readonly<Record<Action, ActionSpec>>;
/** Actions that replace the current document; used to decide whether a stale epoch survives. */
export declare const NAVIGATION: ReadonlySet<string>;
export declare function isAction(value: unknown): value is Action;
export declare function actionFields(action: Action): readonly string[];
/** Reference formats are backend-owned; the protocol only bounds them. */
export declare const EMBEDDED_REF_PATTERN: RegExp;
export declare const CDP_REF_PATTERN: RegExp;
/** One validated finite browser command; only the fields its action allows are present. */
export interface BrowserCommand {
    action: Action;
    url?: string;
    target?: string;
    text?: string;
    x?: number;
    y?: number;
    key?: string;
    value?: string;
}
