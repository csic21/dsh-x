import type { Observation } from '../../contract/observation.ts';
import type { SnapshotResult } from './contract.ts';
/** Model-facing refs are the bare `e12` keys; the CLI expects the `@e12` form. */
export declare function cliRef(ref: string): string;
/**
 * agent-browser appends the current form value after `]:` for value-bearing roles.
 * Values never enter a model observation; the role/name/ref line is kept.
 */
export declare function redactSnapshot(text: string): string;
/** Turn one CLI snapshot into the shared observation shape; text is bounded downstream. */
export declare function observationFromSnapshot(targetId: string, revision: number, snapshot: SnapshotResult, title?: string): Observation;
