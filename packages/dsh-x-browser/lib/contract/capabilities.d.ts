import { type Action } from './commands.ts';
export type Capability = Action;
export type CapabilitySet = ReadonlySet<Capability>;
export type BackendKind = 'embedded' | 'cdp';
/** Actions the embedded webview backend implements today. */
export declare const EMBEDDED_CAPABILITIES: CapabilitySet;
/** Actions the agent-browser (CDP) backend exposes to the model. */
export declare const CDP_CAPABILITIES: CapabilitySet;
export declare function capabilitiesOf(kind: BackendKind): CapabilitySet;
export declare function supports(capabilities: CapabilitySet, action: Capability): boolean;
/** Refuse the action before any backend work; callers never branch on backend kind. */
export declare function assertCapability(capabilities: CapabilitySet, action: Capability): void;
