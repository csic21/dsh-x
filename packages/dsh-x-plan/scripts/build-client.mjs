import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
// The official npm client contract is a lazy CommonJS factory, not an ESM
// script or dynamic-cordis snippet. React is supplied by the shell module table.
await build({
  absWorkingDir: root, entryPoints: ['src/client/index.js'], outfile: 'lib/client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: ['es2022'],
  external: ['react'], sourcemap: false, legalComments: 'none',
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-x-plan", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
