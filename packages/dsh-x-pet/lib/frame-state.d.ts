import type { Frame, PetState } from './frames.ts';
/** The slice of a live Session this fold reads. */
export interface LiveSessionFacts {
    id: string;
    seq?: number;
    snapshotEvents(from?: number): readonly FrameEvent[];
}
export interface FrameEvent {
    type: string;
    seq?: number;
    time?: number;
    /** Event payload; each event type narrows it itself. */
    data?: unknown;
}
export interface FrameFacts {
    sessionId: string | null;
    title: string | null;
    /** What the watched conversation is doing right now. */
    phase: 'tool' | 'thinking' | 'working' | 'idle';
    /** The tool in flight, when `phase` is `tool`. */
    tool: string | null;
    /** Milliseconds since the running turn started; null when it began out of view. */
    elapsedMs: number | null;
    /** How many conversations are running. */
    count: number;
    /** The animation the sprite should play. */
    state: PetState;
}
/**
 * Read one session's tail into the facts the pet narrates.
 *
 * A session is running while its last `turn/start` has no later `turn/end`.
 * The title is the last `session/title` the tail still holds; an older title
 * simply stays unknown rather than scanning a long log on every frame.
 */
export declare function readSessionFacts(session: LiveSessionFacts, now?: number): Omit<FrameFacts, 'count'> & {
    startedAt: number | null;
};
/**
 * Fold every live session into one story: the most recently started turn wins,
 * because that is the conversation the user just touched.
 */
export declare function readFrameFacts(sessions: readonly LiveSessionFacts[], now?: number): FrameFacts;
/** The playback plan a window mirrors until the next poll; every state loops. */
export declare function playbackFor(state: PetState): {
    frames: Frame[];
    loopStart: number | null;
};
