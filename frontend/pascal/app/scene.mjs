import { BuildingNode, ItemNode, LevelNode, SiteNode, WallNode } from '@pascal-app/core'
import { validateLayout } from '../../integration/layout-document.mjs'

export const layoutId = 'week-13'
export const deviceId = 'lamp-7'
const levelId = 'level_demo'

export const proceduralFloorLamp = {
  name: 'Floor lamp', id: 'floor-lamp', dimensions: [0.4, 1.2, 0.2],
  category: 'furniture', thumbnail: '', src: '/models/floor-lamp.glb',
  scale: [1, 1, 0.625], // Fit the evaluation model's 32 cm depth to the 20 cm template.
}

export function startingScene(children = [], roomId = 'room-1') {
  // A single wall doesn't enclose a Pascal zone. The level groups this demo room.
  const level = LevelNode.parse({
    id: levelId, name: 'Demo room', parentId: 'building_demo',
    metadata: { week13Id: roomId }, children: children.map(({ id }) => id),
  })
  const building = BuildingNode.parse({ id: 'building_demo', parentId: 'site_demo', children: [level.id] })
  const site = SiteNode.parse({ id: 'site_demo', children: [building.id], showGround: false })
  return {
    nodes: Object.fromEntries([site, building, level, ...children].map((node) => [node.id, node])),
    rootNodeIds: [site.id],
  }
}

export function importWeek13Layout(document) {
  const [room] = validateLayout(document).rooms
  const [wall] = room.walls
  const [lamp] = room.items
  const wallNode = WallNode.parse({
    id: 'wall_imported', parentId: levelId, metadata: { week13Id: wall.id },
    start: wall.start.map((cm) => cm / 100), end: wall.end.map((cm) => cm / 100),
    height: 2.4, thickness: 0.15,
  })
  const itemNode = ItemNode.parse({
    id: 'item_imported', parentId: levelId, metadata: { week13Id: lamp.id },
    name: proceduralFloorLamp.name, asset: proceduralFloorLamp,
    position: [lamp.position[0] / 100, 0, lamp.position[1] / 100],
    rotation: [0, -lamp.rotationDeg * (Math.PI / 180), 0],
  })
  return {
    scene: startingScene([wallNode, itemNode], room.id),
    bindings: { [itemNode.id]: lamp.deviceId },
  }
}

export function findBoundLamp(nodes, bindings) {
  const id = Object.keys(bindings).find((id) =>
    nodes[id]?.type === 'item' && nodes[id].asset.id === proceduralFloorLamp.id,
  )
  return id ? nodes[id] : undefined
}

// The binding belongs to the placed item ID, outside the graph and clipboard.
export function layoutDocument(scene, bindings) {
  // Pascal's autosave omits this transient flag. Plugin IDs travel in installedPlugins.
  const { hasExplicitPluginInstallState: _editorFlag, ...savedScene } = scene
  const lamp = findBoundLamp(scene.nodes, bindings)
  return {
    version: 1,
    id: layoutId,
    scene: savedScene,
    bindings: lamp ? { [lamp.id]: bindings[lamp.id] } : {},
  }
}
