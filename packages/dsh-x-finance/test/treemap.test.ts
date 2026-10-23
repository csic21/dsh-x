import test from 'node:test'
import assert from 'node:assert/strict'
import { changeTone, layoutNested, squarify, tileSize } from '../src/client/market/treemap.ts'

const close = (left: number, right: number, epsilon = 1e-6) => Math.abs(left - right) <= epsilon

function overlaps(a: any, b: any) {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + 1e-6
    && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + 1e-6
}

test('squarify fills the area without overlaps and keeps every positive item', () => {
  const items = Array.from({ length: 31 }, (_, index) => ({ key: `k${index}`, value: index === 3 ? 0 : 31 - index }))
  const rects = squarify(items, 0, 0, 1000, 420)
  assert.equal(rects.length, 30)
  const area = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0)
  assert.ok(close(area, 1000 * 420, 1e-3), `${area}`)
  for (const rect of rects) {
    assert.ok(rect.x >= -1e-6 && rect.y >= -1e-6)
    assert.ok(rect.x + rect.width <= 1000 + 1e-6)
    assert.ok(rect.y + rect.height <= 420 + 1e-6)
  }
  for (let left = 0; left < rects.length; left++) {
    for (let right = left + 1; right < rects.length; right++) assert.equal(overlaps(rects[left], rects[right]), false)
  }
})

test('squarify is deterministic and ignores non-positive values', () => {
  const items = [{ key: 'a', value: 5 }, { key: 'b', value: -1 }, { key: 'c', value: Number.NaN }, { key: 'd', value: 3 }]
  const first = squarify(items, 0, 0, 100, 100)
  const second = squarify([...items].reverse(), 0, 0, 100, 100)
  assert.deepEqual(first, second)
  assert.deepEqual(first.map(rect => rect.key).sort(), ['a', 'd'])
  assert.deepEqual(squarify([], 0, 0, 100, 100), [])
  assert.deepEqual(squarify([{ key: 'a', value: 0 }], 0, 0, 100, 100), [])
})

test('nested layout reserves a header and keeps children inside their group', () => {
  const groups = [
    { key: 'g1', value: 60, children: [{ key: 'a', value: 30 }, { key: 'b', value: 20 }, { key: 'c', value: 10 }] },
    { key: 'g2', value: 40, children: [{ key: 'd', value: 25 }, { key: 'e', value: 15 }] },
  ]
  const layout = layoutNested(groups, 1000, 420, 18)
  assert.equal(layout.length, 2)
  for (const group of layout) {
    assert.equal(group.headerHeight, 18)
    const innerArea = group.children.reduce((sum, child) => sum + child.width * child.height, 0)
    assert.ok(close(innerArea, group.width * (group.height - 18), 1e-3))
    for (const child of group.children) {
      assert.ok(child.y >= group.y + 18 - 1e-6)
      assert.ok(child.x >= group.x - 1e-6 && child.x + child.width <= group.x + group.width + 1e-6)
      assert.ok(child.y + child.height <= group.y + group.height + 1e-6)
    }
  }
})

test('nested layout falls back to child weights and avoids tiny headers', () => {
  const layout = layoutNested([
    { key: 'a', value: 0, children: [{ key: 'x', value: 2 }, { key: 'y', value: 1 }] },
    { key: 'b', value: 0, children: [{ key: 'z', value: 1 }] },
  ], 200, 80, 18)
  assert.equal(layout.length, 2)
  assert.ok(layout.every(group => group.headerHeight === 18 || group.headerHeight === 0))
})

test('change tones follow Chinese red-up / green-down buckets', () => {
  assert.equal(changeTone(0), 'flat')
  assert.equal(changeTone(0.01), 'up-1')
  assert.equal(changeTone(0.2), 'up-2')
  assert.equal(changeTone(0.7), 'up-3')
  assert.equal(changeTone(1.5), 'up-4')
  assert.equal(changeTone(3), 'up-5')
  assert.equal(changeTone(-0.01), 'down-1')
  assert.equal(changeTone(-2), 'down-4')
  assert.equal(changeTone(-9), 'down-5')
  assert.equal(tileSize({ key: 'a', x: 0, y: 0, width: 100, height: 100 }), 'xl')
  assert.equal(tileSize({ key: 'a', x: 0, y: 0, width: 20, height: 20 }), 'sm')
  assert.equal(tileSize({ key: 'a', x: 0, y: 0, width: 5, height: 5 }), 'xs')
})
