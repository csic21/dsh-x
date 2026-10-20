/** One bounded page observation shared by every backend; the model only ever sees this shape. */
export interface Observation {
    targetId: string;
    url: string;
    title: string;
    revision: number;
    refs: Record<string, string>;
    text: string;
    truncated: boolean;
}
/** Untrusted backend input normalized before it reaches a model result. */
export interface ObservationInput {
    targetId: unknown;
    revision: unknown;
    url?: unknown;
    title?: unknown;
    refs?: unknown;
    text?: unknown;
}
/** Only origin/path may cross into a model result; query/hash can contain login secrets. */
export declare function modelUrl(value: unknown): string;
/** Normalize one backend observation: bounded text, bounded references, no private URL parts. */
export declare function boundObservation(input: ObservationInput): Observation;
