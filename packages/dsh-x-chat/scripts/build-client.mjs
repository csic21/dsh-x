import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
// Use the official dynamic client factory contract; React comes from the shell.
await build({
  absWorkingDir: root, entryPoints: ['src/client/index.js'], outfile: 'lib/client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: ['es2022'],
  external: ['react'], sourcemap: false, legalComments: 'none',
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-x-chat", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
