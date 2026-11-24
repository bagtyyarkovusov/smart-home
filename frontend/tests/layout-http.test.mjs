import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createLayoutClient } from '../integration/layout-client.mjs'
import { createMockLayoutHandler } from '../integration/mock-layout.mjs'
import { fromLayoutDocument, LAYOUT_PATH, toLayoutDocument } from '../integration/layout-document.mjs'

const contract = new URL('../../docs/contracts/week-13/', import.meta.url)
const fixture = JSON.parse(await readFile(new URL('layout.v1.json', contract), 'utf8'))
const errors = JSON.parse(await readFile(new URL('layout-errors.json', contract), 'utf8'))

async function assertError(response, status, example) {
  assert.equal(response.status, status)
  assert.match(response.headers.get('content-type'), /^application\/json/)
  const body = await response.json()
  assert.deepEqual(Object.keys(body), ['error'])
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message'])
  assert.equal(body.error.code, example.error.code)
  assert.ok(typeof body.error.message === 'string' && body.error.message.trim())
}

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

test('matches the shared layout fixture and HTTP error responses', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'smart-home-layout-'))
  const file = join(dir, 'layout.json')
  t.after(() => rm(dir, { recursive: true, force: true }))
  const fetchLayout = mockFetch(file)
  const client = createLayoutClient(undefined, { fetchLayout })
  assert.equal(LAYOUT_PATH, '/api/layouts/week-13')
  const missing = await fetchLayout('/api/layouts/week-13', {})
  await assertError(missing, 404, errors.layoutNotFound)
  assert.equal(await client.load(), null)

  const write = (layout, headers) => fetchLayout('/api/layouts/week-13', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(layout),
  })
  const firstSave = await write(fixture)
  assert.equal(firstSave.status, 200)
  assert.deepEqual(await firstSave.json(), fixture)
  assert.deepEqual(await client.load(), fixture)

  const moved = structuredClone(fixture)
  moved.rooms[0].items[0].position = [-460, 80.5]
  moved.rooms[0].items[0].rotationDeg = 405
  await assertError(await write(moved, { 'X-Mock-Fail-Save': '1' }), 500, errors.layoutSaveFailed)
  const retryingClient = createLayoutClient(undefined, { fetchLayout, failFirstSave: true })
  await assert.rejects(retryingClient.save(moved), /HTTP 500 \(layout_save_failed\)/)
  assert.deepEqual(await client.load(), fixture)

  for (const invalidate of [
    (layout) => { layout.version = 2 },
    (layout) => { layout.rooms[0].items[0].deviceId = 'lamp-8' },
    (layout) => { layout.rooms[0].items[0].id = 'wall-1' },
    (layout) => { layout.rooms[0].walls[0].end = [20, 40] },
    (layout) => { layout.rooms[0].items = [] },
  ]) {
    const invalid = structuredClone(moved)
    invalidate(invalid)
    await assertError(await write(invalid), 422, errors.invalidLayout)
    assert.deepEqual(await client.load(), fixture)
  }

  const malformed = await fetchLayout(LAYOUT_PATH, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Mock-Fail-Save': '1' }, body: '{',
  })
  await assertError(malformed, 422, errors.invalidLayout)
  assert.deepEqual(await client.load(), fixture)
  assert.deepEqual(await retryingClient.save(moved), moved)
  assert.deepEqual(await createLayoutClient(undefined, { fetchLayout: mockFetch(file) }).load(), moved)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), moved)
})

test('maps the saved layout to Home3D and back without changing IDs or coordinates', () => {
  const { objects, roomId } = fromLayoutDocument(fixture)
  assert.equal(roomId, 'room-1')
  const [wall, lamp] = objects
  assert.deepEqual([wall.id, wall.start, wall.end], ['wall-1', [20, 40], [320, 440]])
  assert.deepEqual([lamp.id, lamp.deviceId, lamp.x, lamp.y, lamp.rotation], ['item-1', 'lamp-7', 120, 80, 30])
  assert.deepEqual([lamp.width, lamp.height, lamp.depth], [40, 20, 120])
  assert.deepEqual(toLayoutDocument(objects, roomId), fixture)

  const change = structuredClone(fixture)
  change.rooms[0].id = 'living-room'
  change.rooms[0].items[0].position = [-17.25, 42]
  change.rooms[0].items[0].rotationDeg = -405
  const reopened = fromLayoutDocument(change)
  assert.deepEqual(toLayoutDocument(reopened.objects, reopened.roomId), change)
  assert.throws(() => toLayoutDocument([lamp]), /one wall and one Sample Floor Lamp/)
  assert.throws(() => toLayoutDocument([wall, lamp, { type: 'door', name: 'Door' }]), /Remove Door/)
  assert.throws(() => toLayoutDocument([wall, { ...lamp, width: 50 }]), /40 × 20 × 120 cm/)
})

test('reopens a compatible legacy mock layout and rewrites it on the next save', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'smart-home-layout-'))
  const file = join(dir, 'layout.json')
  t.after(() => rm(dir, { recursive: true, force: true }))
  const { objects } = fromLayoutDocument(fixture)
  Object.assign(objects[1], { width: 42, height: 32, depth: 150 })
  const original = { version: 1, projectName: 'Previous demo', objects }
  await writeFile(file, JSON.stringify(original))
  const client = createLayoutClient(undefined, { fetchLayout: mockFetch(file) })
  assert.deepEqual(await client.load(), fixture)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), original)
  await client.save(fixture)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), fixture)
})

test('keeps a canonical document readable even if it has legacy-named metadata', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'smart-home-layout-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const client = createLayoutClient(undefined, { fetchLayout: mockFetch(join(dir, 'layout.json')) })
  const withMetadata = { ...fixture, projectName: 'Demo room', objects: [] }
  assert.deepEqual(await client.save(withMetadata), withMetadata)
  assert.deepEqual(await client.load(), withMetadata)
})
