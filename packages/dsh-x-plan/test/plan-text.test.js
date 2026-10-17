import assert from 'node:assert/strict'
import test from 'node:test'

import { parseAcceptance, parseVerdict } from '../src/plan-text.js'

test('acceptance fence uses the last block and skips comments', () => {
  const parsed = parseAcceptance(`
\`\`\`dsh-x-acceptance
echo old
\`\`\`

\`\`\`dsh-x-acceptance
# comment

pnpm test
pnpm run typecheck
\`\`\`
`)
  assert.deepEqual(parsed, { commands: ['pnpm test', 'pnpm run typecheck'] })
})

test('a missing acceptance fence means there is nothing to run', () => {
  assert.deepEqual(parseAcceptance('没有代码块'), { commands: [] })
})

test('too many acceptance commands is an error', () => {
  const lines = Array.from({ length: 9 }, (_, index) => `echo ${index}`).join('\n')
  const parsed = parseAcceptance(`\`\`\`dsh-x-acceptance\n${lines}\n\`\`\``)
  assert.equal(Object.hasOwn(parsed, 'error'), true)
})

test('verdict fail returns the gap list without the fence', () => {
  const parsed = parseVerdict('1. 测试没过\n\n```dsh-x-verdict\nfail\n```')
  assert.equal(parsed.verdict, 'fail')
  assert.equal(parsed.gaps, '1. 测试没过')
})

test('a missing verdict is inconclusive', () => {
  const parsed = parseVerdict('看不出结论')
  assert.equal(parsed.verdict, 'inconclusive')
  assert.match(parsed.gaps, /dsh-x-verdict/)
})
