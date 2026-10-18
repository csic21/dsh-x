// Deterministic squarified treemap layout. Pure geometry, no DOM or data
// source: callers pass positive weights and receive rectangles in the same
// coordinate system, so the layout can be tested without a browser.
export interface TreemapItem {
  key: string
  value: number
}

export interface TreemapRect {
  key: string
  x: number
  y: number
  width: number
  height: number
}

export interface TreemapGroup {
  key: string
  value: number
  children: TreemapItem[]
}

export interface NestedGroup extends TreemapRect {
  children: TreemapRect[]
  headerHeight: number
}

const area = (value: number) => Number.isFinite(value) && value > 0 ? value : 0

function worst(row: TreemapItem[], side: number, scale: number): number {
  let sum = 0, max = 0, min = Infinity
  for (const item of row) {
    const value = item.value * scale
    sum += value
    if (value > max) max = value
    if (value < min) min = value
  }
  if (!sum || !min) return Infinity
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

function layoutRow(row: TreemapItem[], node: { x: number; y: number; width: number; height: number }, scale: number, output: TreemapRect[]) {
  const total = row.reduce((sum, item) => sum + item.value * scale, 0)
  if (total <= 0) return node
  if (node.width >= node.height) {
    const width = Math.min(node.width, total / node.height)
    let top = node.y
    for (const item of row) {
      const height = width > 0 ? (item.value * scale) / width : 0
      output.push({ key: item.key, x: node.x, y: top, width, height })
      top += height
    }
    return { x: node.x + width, y: node.y, width: Math.max(0, node.width - width), height: node.height }
  }
  const height = Math.min(node.height, total / node.width)
  let left = node.x
  for (const item of row) {
    const width = height > 0 ? (item.value * scale) / height : 0
    output.push({ key: item.key, x: left, y: node.y, width, height })
    left += width
  }
  return { x: node.x, y: node.y + height, width: node.width, height: Math.max(0, node.height - height) }
}

/**
 * Squarified layout. Items with non-finite or non-positive values are ignored;
 * the order of equal values follows the input order.
 */
export function squarify(items: TreemapItem[], x: number, y: number, width: number, height: number): TreemapRect[] {
  if (!(width > 0) || !(height > 0)) return []
  const values = items.filter(item => area(item.value) > 0)
    .map(item => ({ ...item, value: area(item.value) }))
    .sort((left, right) => right.value - left.value)
  const total = values.reduce((sum, item) => sum + item.value, 0)
  if (!total) return []
  const scale = (width * height) / total
  const output: TreemapRect[] = []
  let node = { x, y, width, height }
  let row: TreemapItem[] = []
  let index = 0
  while (index < values.length) {
    const item = values[index]!
    const side = Math.min(node.width, node.height)
    if (!row.length || worst(row, side, scale) >= worst([...row, item], side, scale)) {
      row.push(item)
      index++
    } else {
      node = layoutRow(row, node, scale, output)
      row = []
    }
  }
  if (row.length) layoutRow(row, node, scale, output)
  return output
}

/**
 * Lays out level-1 groups and their level-2 children. Each child area starts
 * below a compact group header. Groups too small for readable text fall back
 * to a header-only rectangle with no children.
 */
export function layoutNested(groups: TreemapGroup[], width: number, height: number, header = 18): NestedGroup[] {
  const normalized = groups.map(group => ({
    ...group,
    value: area(group.value) || group.children.reduce((sum, child) => sum + area(child.value), 0) || 1,
  })).filter(group => group.value > 0)
  const rects = squarify(normalized.map(group => ({ key: group.key, value: group.value })), 0, 0, width, height)
  const byKey = new Map(normalized.map(group => [group.key, group]))
  return rects.map(rect => {
    const group = byKey.get(rect.key)!
    const showHeader = rect.width >= 54 && rect.height >= 30
    const headerHeight = showHeader ? Math.min(header, rect.height * 0.28) : 0
    const children = group.children.filter(child => area(child.value) > 0)
    const inner = children.length && rect.height - headerHeight > 4
      ? squarify(children, rect.x, rect.y + headerHeight, rect.width, rect.height - headerHeight)
      : []
    return { ...rect, headerHeight, children: inner }
  })
}

export type ChangeTone = 'flat' | 'up-1' | 'up-2' | 'up-3' | 'up-4' | 'up-5' | 'down-1' | 'down-2' | 'down-3' | 'down-4' | 'down-5'

export function changeTone(value: number): ChangeTone {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return 'flat'
  const magnitude = Math.abs(value)
  const level = magnitude < 0.2 ? 1 : magnitude < 0.7 ? 2 : magnitude < 1.5 ? 3 : magnitude < 3 ? 4 : 5
  return `${value > 0 ? 'up' : 'down'}-${level}` as ChangeTone
}

export function tileSize(rect: TreemapRect): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
  const pixels = rect.width * rect.height
  if (pixels >= 9000) return 'xl'
  if (pixels >= 3000) return 'lg'
  if (pixels >= 900) return 'md'
  if (pixels >= 240) return 'sm'
  return 'xs'
}
