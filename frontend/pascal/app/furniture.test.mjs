import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { ItemNode } from '@pascal-app/core'
import { Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { filterFurniture, furnitureTemplates } from './furniture-catalog.mjs'
import { proceduralFloorLamp } from './scene.mjs'

test('the furnished room templates use self-contained, floor-centered models at plan scale', async () => {
  const ids = new Set(furnitureTemplates.map(({ id }) => id))
  assert.equal(ids.size, furnitureTemplates.length)
  for (const id of ['floor-lamp', 'lounge-chair', 'coffee-table', 'rug', 'potted-plant', 'stool', 'bench']) {
    assert(ids.has(id), id)
  }
  for (const asset of furnitureTemplates) {
    assert.match(asset.id, /^[a-z][a-z0-9-]*$/)
    assert(asset.name.trim(), asset.id)
    assert(asset.category.trim(), asset.id)
    assert.equal(asset.dimensions.length, 3, asset.id)
    assert(asset.dimensions.every((value) => Number.isFinite(value) && value > 0), asset.id)
    assert.match(asset.thumbnail, /^\/thumbnails\/[a-z0-9-]+\.webp$/)
    const thumbnail = await readFile(new URL(`../public${asset.thumbnail}`, import.meta.url))
    assert.equal(thumbnail.toString('ascii', 0, 4), 'RIFF', asset.id)
    assert.equal(thumbnail.toString('ascii', 8, 12), 'WEBP', asset.id)
    const parsed = ItemNode.parse({ asset }).asset
    for (const [field, value] of Object.entries(asset)) assert.deepEqual(parsed[field], value, asset.id)
  }
  const loader = new GLTFLoader().register(() => ({
    name: 'Measure geometry without decoding images',
    loadTexture: () => Promise.resolve(null),
  }))
  for (const { id, src, dimensions, scale } of [...furnitureTemplates, proceduralFloorLamp]) {
    assert.match(src, /^\/models\/[a-z0-9-]+\.glb$/)
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

test('catalog search trims and folds names and category labels and combines filters', () => {
  assert.deepEqual(filterFurniture('  CHAIR  ', 'Seating').map(({ id }) => id), ['lounge-chair'])
  assert.deepEqual(filterFurniture('chair', 'Decor'), [])
  assert.deepEqual(filterFurniture(' lighting ').map(({ id }) => id), ['floor-lamp'])
})
