import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  COLUMNS,
  IDLE_ROW,
  LOOK_DIRECTIONS,
  LOOK_ROW_A,
  LOOK_ROW_B,
  LOOK_STEP_DEGREES,
  STATE_FRAMES,
  V1_HEIGHT,
  V2_HEIGHT,
  columnPercent,
  lookFrame,
  resolvePlayback,
  rowPercent,
  rowsForHeight,
} from '../src/frames.ts'

test('the atlas geometry is the Codex sheet: 8 columns of 192x208 cells', () => {
  assert.equal(COLUMNS, 8)
  assert.equal(CELL_WIDTH, 192)
  assert.equal(CELL_HEIGHT, 208)
  assert.equal(V1_HEIGHT, 1872)
  assert.equal(V2_HEIGHT, 2288)
})

test('every state owns the row and frame count the Codex contract defines', () => {
  assert.deepEqual(Object.keys(STATE_FRAMES).sort(), [
    'failed', 'idle', 'jumping', 'review', 'running', 'running-left', 'running-right', 'waiting', 'waving',
  ])
  assert.equal(STATE_FRAMES.idle.length, 6)
  assert.equal(STATE_FRAMES['running-right'].length, 8)
  assert.equal(STATE_FRAMES['running-left'].length, 8)
  assert.equal(STATE_FRAMES.waving.length, 4)
  assert.equal(STATE_FRAMES.jumping.length, 5)
  assert.equal(STATE_FRAMES.failed.length, 8)
  assert.equal(STATE_FRAMES.waiting.length, 6)
  assert.equal(STATE_FRAMES.running.length, 6)
  assert.equal(STATE_FRAMES.review.length, 6)
  for (const state of Object.keys(STATE_FRAMES) as (keyof typeof STATE_FRAMES)[]) {
    STATE_FRAMES[state].forEach((frame, index) => {
      assert.equal(frame.row, IDLE_ROW[state], `${state} row`)
      assert.equal(frame.column, index, `${state} column ${index}`)
    })
  }
})

test('the frame durations match the published Codex timings', () => {
  assert.deepEqual(STATE_FRAMES.idle.map(frame => frame.durationMs), [280, 110, 110, 140, 140, 320])
  assert.deepEqual(STATE_FRAMES['running-right'].map(frame => frame.durationMs), [120, 120, 120, 120, 120, 120, 120, 220])
  assert.deepEqual(STATE_FRAMES['running-left'].map(frame => frame.durationMs), [120, 120, 120, 120, 120, 120, 120, 220])
  assert.deepEqual(STATE_FRAMES.waving.map(frame => frame.durationMs), [140, 140, 140, 280])
  assert.deepEqual(STATE_FRAMES.jumping.map(frame => frame.durationMs), [140, 140, 140, 140, 280])
  assert.deepEqual(STATE_FRAMES.failed.map(frame => frame.durationMs), [140, 140, 140, 140, 140, 140, 140, 240])
  assert.deepEqual(STATE_FRAMES.waiting.map(frame => frame.durationMs), [150, 150, 150, 150, 150, 260])
  assert.deepEqual(STATE_FRAMES.running.map(frame => frame.durationMs), [120, 120, 120, 120, 120, 220])
  assert.deepEqual(STATE_FRAMES.review.map(frame => frame.durationMs), [150, 150, 150, 150, 150, 280])
})

test('idle runs six times slower so the resting loop stays calm', () => {
  const plan = resolvePlayback('idle')
  assert.deepEqual(plan.frames.map(frame => frame.durationMs), [1680, 660, 660, 840, 840, 1920])
  assert.equal(plan.loopStart, 0)
})

test('a one-shot state plays three times and then settles into the idle loop', () => {
  const plan = resolvePlayback('waving')
  const waving = STATE_FRAMES.waving.length
  assert.equal(plan.frames.length, waving * 3 + 6)
  assert.equal(plan.loopStart, waving * 3)
  assert.deepEqual(plan.frames.slice(0, waving * 3).map(frame => frame.durationMs), [
    140, 140, 140, 280, 140, 140, 140, 280, 140, 140, 140, 280,
  ])
  assert.deepEqual(plan.frames.slice(waving * 3).map(frame => frame.durationMs), [1680, 660, 660, 840, 840, 1920])
})

test('an explicit loop repeats the state forever', () => {
  const plan = resolvePlayback('running', { loop: true })
  assert.equal(plan.frames.length, STATE_FRAMES.running.length)
  assert.equal(plan.loopStart, 0)
})

test('reduced motion shows one frame and stops', () => {
  const plan = resolvePlayback('running', { reducedMotion: true })
  assert.equal(plan.frames.length, 1)
  assert.equal(plan.frames[0].row, STATE_FRAMES.running[0].row)
  assert.equal(plan.loopStart, null)
})

test('background positions spread the cells evenly', () => {
  assert.equal(columnPercent(0), 0)
  assert.equal(columnPercent(7), 100)
  assert.equal(rowPercent(0, 11), 0)
  assert.equal(rowPercent(10, 11), 100)
  assert.equal(rowPercent(8, 11), 80)
})

test('a sheet height decides the row count, and other heights are refused', () => {
  assert.equal(rowsForHeight(V1_HEIGHT), 9)
  assert.equal(rowsForHeight(V2_HEIGHT), 11)
  assert.equal(rowsForHeight(1871), null)
  assert.equal(rowsForHeight(2000), null)
})

test('look directions are 16 clockwise steps of 22.5 degrees', () => {
  assert.equal(LOOK_DIRECTIONS, 16)
  assert.equal(LOOK_STEP_DEGREES, 22.5)
  // 000 degrees looks up: the pet turns its gaze to row 9, column 0.
  assert.deepEqual(lookFrame(0, -100), { row: LOOK_ROW_A, column: 0 })
  // 090 degrees looks screen-right.
  assert.deepEqual(lookFrame(100, 0), { row: LOOK_ROW_A, column: 4 })
  // 180 degrees looks down and 270 degrees looks screen-left.
  assert.deepEqual(lookFrame(0, 100), { row: LOOK_ROW_B, column: 0 })
  assert.deepEqual(lookFrame(-100, 0), { row: LOOK_ROW_B, column: 4 })
})

test('the pointer deadzone falls back to the idle animation', () => {
  assert.equal(lookFrame(0, 0), null)
  assert.equal(lookFrame(0.5, 0.5), null)
  assert.notEqual(lookFrame(0, -40), null)
})
