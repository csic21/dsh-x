import type { Context } from '@deepseek-ai/cordis';
import type { EmbeddedBroker } from './broker.ts';
/** Register the renderer RPC surface of the embedded backend; no model-facing tool lives here. */
export declare function registerEmbeddedRoutes(ctx: Context, broker: EmbeddedBroker): void;
