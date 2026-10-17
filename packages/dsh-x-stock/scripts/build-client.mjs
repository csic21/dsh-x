import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
// The official npm client contract is a lazy CommonJS factory, not an ESM
// script or dynamic-cordis snippet. React is supplied by the shell module table.
await build({
  absWorkingDir: root, entryPoints: ['src/client/index.js'], outfile: 'lib/client.js',
  bundle: true, format: 'cjs', platform: 'browser', target: ['es2022'],
  external: ['react'], sourcemap: false, legalComments: 'inline',
  banner: { js: '/*! TradingView Lightweight Charts™; Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/; see bundled licenses/lightweight-charts.NOTICE and LICENSE. */\nwindow.__ModuleLoader__.load({ id: "dsh-x-stock", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
