import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['src/client/index.js'],outfile:'lib/client.js',bundle:true,format:'cjs',platform:'browser',target:['es2022'],external:['react','@deepseek-ai/dsh-client-ui-primitives'],sourcemap:false,legalComments:'none',banner:{js:'window.__ModuleLoader__.load({ id: "dsh-x-code", factory: (require) => { var module = { exports: {} }; var exports = module.exports;'},footer:{js:'return module.exports; } });'}})
