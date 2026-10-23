// Shared package builder. Run it from a package directory (the package
// scripts do) or pass one: `node scripts/build-package.mjs packages/dsh-x-finance`.
//
//   1. Remove lib/ so renamed or deleted sources never linger as stale output.
//   2. Emit host JavaScript and declarations with tsc when the package has
//      tsconfig.build.json. All workspace plugins now use TypeScript.
//   3. Bundle src/client into lib/client.js under the official lazy CommonJS
//      factory contract. React and official @deepseek-ai/* packages come from
//      the shell's shared module table; every other dependency is bundled.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = fileURLToPath(new URL('../', import.meta.url))
const directory = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()
const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))

// The shell module table supplies these names at runtime; `dsh.client.inject`
// declares the official dependencies and the client tests assert the exact
// required names, so an accidental import fails loudly instead of silently
// bundling a second copy of an official package.
const SHARED_MODULES = /^(?:react(?:-dom)?(?:\/|$)|@deepseek-ai\/)/
// TradingView Lightweight Charts requires its notice to travel with the bundle.
const NOTICES = {
  'dsh-x-finance': '/*! TradingView Lightweight Charts™; Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/; see bundled licenses/lightweight-charts.NOTICE and LICENSE. */',
}

if (!existsSync(path.join(directory, 'tsconfig.build.json'))) throw new Error(`${manifest.name} must declare tsconfig.build.json`)

const lib = path.join(directory, 'lib')
rmSync(lib, { recursive: true, force: true })

{
  const tsc = path.join(repository, 'node_modules', '.bin', 'tsc')
  const result = spawnSync(tsc, ['-p', 'tsconfig.build.json'], {
    cwd: directory,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const entry = ['src/client/index.ts', 'src/client/index.tsx']
  .find(file => existsSync(path.join(directory, file)))
if (entry) {
  const notice = NOTICES[manifest.name] ? `${NOTICES[manifest.name]}\n` : ''
  await build({
    absWorkingDir: directory, entryPoints: [entry], outfile: 'lib/client.js',
    bundle: true, format: 'cjs', platform: 'browser', target: ['es2022'],
    sourcemap: false, legalComments: notice ? 'inline' : 'none',
    plugins: [{
      name: 'shell-shared-modules',
      setup(api) { api.onResolve({ filter: SHARED_MODULES }, arguments_ => ({ path: arguments_.path, external: true })) },
    }],
    banner: { js: `${notice}window.__ModuleLoader__.load({ id: "${manifest.name}", factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
    footer: { js: 'return module.exports; } });' },
  })
}
