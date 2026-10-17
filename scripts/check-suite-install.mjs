import { parseArgs } from 'node:util'
import { inspectSuiteTarget } from './suite-support.mjs'

const { values } = parseArgs({ options: {
  home: { type: 'string' }, profile: { type: 'string', default: 'web' },
  'dsh-version': { type: 'string' }, help: { type: 'boolean', short: 'h' },
} })
if (values.help) {
  console.log('node scripts/check-suite-install.mjs --home /absolute/isolated/home --profile web --dsh-version <actual dsh --version>')
} else {
  const result = inspectSuiteTarget({ home: values.home, profile: values.profile, runtime: values['dsh-version'] })
  console.log(JSON.stringify(result, null, 2))
  if (!result.ready) {
    console.error(result.conflicts.length
      ? '先在官方 Plugins 页面停用列出的独立 bundle，再安装套件；此检查不会修改配置。'
      : '目标尚未准备好；不会自动放宽版本限制或创建 Desktop profile。')
    process.exitCode = 1
  }
}
