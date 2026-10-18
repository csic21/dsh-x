export const CSS = `
.dxc-card { color: var(--dsw-alias-label-primary); margin-block: 8px; font: inherit; }
.dxc-heading { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dxc-disclosure, .dxc-inspect { color: var(--dsw-alias-label-secondary); background: transparent; border: 0; border-radius: 4px; padding: 4px; font: inherit; cursor: pointer; }
.dxc-disclosure { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; text-align: start; }
.dxc-disclosure:focus-visible, .dxc-inspect:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.dxc-details { margin-inline-start: 18px; }
.dxc-details dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 12px; }
.dxc-details dt { color: var(--dsw-alias-label-secondary); }
.dxc-details dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.dxc-answer { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
.dxc-error, .dxc-warning { margin-block: 8px; padding-inline-start: 18px; }
`
