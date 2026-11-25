import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { furnitureTemplates, proceduralFloorLamp } from './scene.mjs'

test('the furnished room templates use self-contained, floor-centered models at plan scale', async () => {
  assert.deepEqual(furnitureTemplates.map(({ id }) => id), [
    'floor-lamp', 'lounge-chair', 'coffee-table', 'rug', 'potted-plant', 'stool', 'bench',
  ])
  const loader = new GLTFLoader().register(() => ({
    name: 'Measure geometry without decoding images',
    loadTexture: () => Promise.resolve(null),
  }))
  for (const { id, src, dimensions, scale } of [...furnitureTemplates, proceduralFloorLamp]) {
    assert.match(src, /^\/models\/[a-z-]+\.glb$/)
    const bytes = await readFile(new URL(`../public${src}`, import.meta.url))
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
    assert.equal(json.buffers.length, 1)
    assert.equal(json.buffers[0].uri, undefined)
    assert(json.images?.every(({ bufferView, uri }) => Number.isInteger(bufferView) && !uri) ?? true)
    assert.equal(json.extensionsRequired, undefined)
    assert.equal(json.animations?.length ?? 0, 0)
    const { scene } = await loader.parseAsync(Uint8Array.from(bytes).buffer, '')
    if (scale) scene.scale.fromArray(scale)
    const bounds = new Box3().setFromObject(scene, true)
    const roundMetres = (value) => Math.round(value * 1000) / 1000 + 0
    assert.deepEqual(bounds.getSize(new Vector3()).toArray().map(roundMetres), dimensions, id)
    const center = bounds.getCenter(new Vector3())
    assert.deepEqual([center.x, bounds.min.y, center.z].map(roundMetres), [0, 0, 0], id)
  }
})
