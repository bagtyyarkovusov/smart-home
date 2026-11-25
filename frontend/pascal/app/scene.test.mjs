import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ItemNode } from '@pascal-app/core'
import { furnitureById } from './furniture-catalog.mjs'
import { importWeek13Layout, layoutDocument, startingScene } from './scene.mjs'

const fixture = JSON.parse(readFileSync(new URL(
  '../../../docs/contracts/week-13/layout.v1.json', import.meta.url,
)))

test('the Week 13 import retains identities and floor transforms in a saved Pascal document', () => {
  const { scene, bindings } = importWeek13Layout(fixture)
  const reopened = JSON.parse(JSON.stringify(layoutDocument(scene, bindings)))
  const { level_demo: room, wall_imported: wall, item_imported: lamp } = reopened.scene.nodes
  assert.equal(reopened.id, 'week-13')
  assert.deepEqual(room.children, [wall.id, lamp.id])
  assert.equal(room.metadata.week13Id, 'room-1')
  assert.equal(wall.metadata.week13Id, 'wall-1')
  assert.equal(lamp.metadata.week13Id, 'item-1')
  assert.deepEqual(wall.start, [0.2, 0.4])
  assert.deepEqual(wall.end, [3.2, 4.4])
  assert.deepEqual(lamp.position, [1.2, 0, 0.8])
  assert.deepEqual(lamp.rotation, [0, -Math.PI / 6, 0])
  assert.equal(lamp.asset.id, 'floor-lamp')
  assert.equal(lamp.asset.src, '/models/floor-lamp.glb')
  assert.deepEqual(reopened.bindings, { item_imported: 'lamp-7' })
})

test('import preserves signed centimeters and clockwise angles beyond a full turn', () => {
  const signed = structuredClone(fixture)
  signed.rooms[0].walls[0].start = [-150, -25]
  const lamp = signed.rooms[0].items[0]
  lamp.position = [-200, -50]
  lamp.rotationDeg = -450
  const { scene } = importWeek13Layout(signed)
  assert.deepEqual(scene.nodes.wall_imported.start, [-1.5, -0.25])
  assert.deepEqual(scene.nodes.item_imported.position, [-2, 0, -0.5])
  assert.deepEqual(scene.nodes.item_imported.rotation, [0, 2.5 * Math.PI, 0])
  signed.rooms[0].items[0].deviceId = 'another-lamp'
  assert.throws(() => importWeek13Layout(signed), /Sample Floor Lamp/)
})

test('manual save and Pascal autosave persist the same scene envelope', () => {
  const { scene, bindings } = importWeek13Layout(fixture)
  const autosavedScene = { ...scene, installedPlugins: [] }
  const manualScene = { ...autosavedScene, hasExplicitPluginInstallState: false }
  assert.deepEqual(layoutDocument(manualScene, bindings), layoutDocument(autosavedScene, bindings))
})

test('a saved layout keeps only the live lamp binding after replacing and restoring the lamp', () => {
  const { scene } = importWeek13Layout(fixture)
  const original = scene.nodes.item_imported
  const replacement = ItemNode.parse({ ...original, id: 'item_replacement' })
  const knownBindings = { item_imported: 'lamp-7', item_replacement: 'lamp-7' }

  assert.deepEqual(layoutDocument(startingScene([replacement]), knownBindings).bindings, { item_replacement: 'lamp-7' })
  assert.deepEqual(layoutDocument(startingScene([]), knownBindings).bindings, {})
  assert.deepEqual(layoutDocument(scene, knownBindings).bindings, { item_imported: 'lamp-7' })
  assert.deepEqual(layoutDocument(startingScene([original, replacement]), knownBindings).bindings, { item_imported: 'lamp-7' })
})

test('a configured vase saves its authored asset and exact transform beside the linked lamp', () => {
  const imported = importWeek13Layout(fixture)
  const { wall_imported: wall, item_imported: lamp } = imported.scene.nodes
  const vase = ItemNode.parse({
    id: 'item_vase', name: 'Ceramic vase', asset: furnitureById('ceramic-vase'),
    parentId: 'level_demo', position: [-1.255, 0, 0.76], rotation: [0, Math.PI / 4, 0],
  })
  const scene = startingScene([wall, lamp, vase])
  const saved = JSON.parse(JSON.stringify(layoutDocument(scene, imported.bindings)))
  assert.deepEqual(saved.scene.nodes.item_vase.asset, {
    id: 'ceramic-vase', name: 'Ceramic vase', category: 'Decor', dimensions: [0.24, 0.32, 0.24],
    src: '/models/ceramic-vase.glb', thumbnail: '/thumbnails/ceramic-vase.webp', tags: ['ceramic'],
    source: 'library', scale: [1, 1, 1], offset: [0, 0, 0], rotation: [0, 0, 0],
  })
  assert.deepEqual(saved.scene.nodes.item_vase.position, [-1.255, 0, 0.76])
  assert.deepEqual(saved.scene.nodes.item_vase.rotation, [0, Math.PI / 4, 0])
  assert.deepEqual(saved.bindings, { item_imported: 'lamp-7' })
})
