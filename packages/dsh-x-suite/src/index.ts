// A configuration bundle, not another launcher or another agent runtime. The
// official Loader keys a live entry by ID, so these components keep the same
// IDs as their standalone bundles (see cordis.patch.yml).

export const name = 'dsh-x-suite'

/** Plugin packages this bundle mounts; Chat, Plan and Stocks stay optional. */
export const components = Object.freeze(['dsh-x-agents', 'dsh-x-code'] as const)
