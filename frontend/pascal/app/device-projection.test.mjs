import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { projectFrame, updateCommand } from './device-projection.mjs'

const { initialState, success, timeout } = JSON.parse(readFileSync(new URL(
  '../../../docs/contracts/week-13/lamp-scenarios.json', import.meta.url,
)))

test('success projects the confirmed revision and ignores an older snapshot', () => {
  const off = { state: initialState, streamRevision: 0 }
  const on = projectFrame(off, success.event)
  assert.equal(on.state.value, true)
  assert.equal(on.state.updatedAt, '2026-11-24T08:00:00.240Z')
  assert.deepEqual(projectFrame(on, { revision: 0, state: initialState }), on)
})

test('timeout and reconnect preserve the last confirmed state and recover the command', () => {
  const off = { state: initialState, streamRevision: 0 }
  assert.deepEqual(projectFrame(off, timeout.event), { state: initialState, streamRevision: 1 })
  assert.deepEqual(projectFrame(off, timeout.reconnect), { state: initialState, streamRevision: 1 })
  const recovered = updateCommand(timeout.accepted, timeout.event.command)
  assert.equal(recovered.status, 'timed_out')
  assert.equal(updateCommand(recovered, timeout.accepted).status, 'timed_out')
})

test('duplicate events are ignored and a new snapshot sets the stream baseline', () => {
  const on = { state: success.event.state, streamRevision: 3 }
  assert.equal(projectFrame(on, { ...success.event, revision: 3 }), on)
  assert.deepEqual(projectFrame(on, {
    type: 'snapshot', revision: 2, state: { ...success.event.state, value: false },
  }), { state: success.event.state, streamRevision: 2 })
})
