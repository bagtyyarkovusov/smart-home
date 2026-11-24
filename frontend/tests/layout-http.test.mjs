import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createLayoutClient } from '../integration/layout-client.mjs'
import { createMockLayoutHandler } from '../integration/mock-layout.mjs'

// Exercise the client and real mock handler without opening a socket.
function mockFetch(file) {
  const handle = createMockLayoutHandler(file)
  return async (url, options) => {
    const request = Object.assign(Readable.from(options.body ? [Buffer.from(options.body)] : []), {
      url, method: options.method ?? 'GET',
      headers: Object.fromEntries(new Headers(options.headers)),
    })
    let status
    let headers
    let response
    await handle(request, {
      writeHead(code, fields) { status = code; headers = fields },
      end(body) { response = new Response(body, { status, headers }) },
    })
    return response
  }
}

test('preserves wall and lamp geometry through the mock HTTP contract and retry', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'smart-home-layout-'))
  const file = join(dir, 'layout.json')
  t.after(() => rm(dir, { recursive: true, force: true }))
  const fetchLayout = mockFetch(file)
  const client = createLayoutClient(undefined, { fetchLayout })
  assert.equal(await client.load(), null)
  const layout = {
    version: 1, projectName: 'Demo room', objects: [
      { id: 'wall-1', type: 'wall', start: [120, 140], end: [560, 160] },
      { id: 'placed-1', deviceId: 'lamp-7', type: 'furniture', subType: 'lamp', x: 400, y: 320, rotation: 45 },
    ],
  }
  assert.deepEqual(await client.save(layout), layout)
  const moved = structuredClone(layout)
  moved.objects[1].x = 460
  const retryingClient = createLayoutClient(undefined, { fetchLayout, failFirstSave: true })
  await assert.rejects(retryingClient.save(moved), /503/)
  assert.deepEqual(await client.load(), layout)
  const invalid = structuredClone(moved)
  invalid.objects[1].deviceId = 'lamp-8'
  await assert.rejects(client.save(invalid), /lamp-7/)
  const invalidResponse = await fetchLayout('/api/layouts/demo-room', {
    method: 'PUT', body: JSON.stringify(invalid),
  })
  assert.equal(invalidResponse.status, 400)
  assert.deepEqual(await retryingClient.save(moved), moved)
  assert.deepEqual(await createLayoutClient(undefined, { fetchLayout: mockFetch(file) }).load(), moved)
})
