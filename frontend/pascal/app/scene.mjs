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

export const floorLamp = {
  ...proceduralFloorLamp, src: '/models/linen-floor-lamp.glb', scale: [1, 1, 1],
}

export const furnitureTemplates = [
  floorLamp,
  {
    name: 'Lounge chair', id: 'lounge-chair', dimensions: [1, 1.17, 1.19],
    category: 'furniture', thumbnail: '', src: '/models/lounge-chair.glb',
  },
  {
    name: 'Coffee table', id: 'coffee-table', dimensions: [1.2, 0.39, 0.6],
    category: 'furniture', thumbnail: '', src: '/models/coffee-table.glb',
  },
  {
    name: 'Rug', id: 'rug', dimensions: [2.6, 0.016, 1.8],
    category: 'furniture', thumbnail: '', src: '/models/rug.glb',
  },
  {
    name: 'Potted plant', id: 'potted-plant', dimensions: [0.17, 0.27, 0.19],
    category: 'furniture', thumbnail: '', src: '/models/potted-plant.glb',
  },
  {
    name: 'Stool', id: 'stool', dimensions: [0.48, 0.45, 0.48],
    category: 'furniture', thumbnail: '', src: '/models/stool.glb',
  },
  {
    name: 'Bench', id: 'bench', dimensions: [1.2, 0.46, 0.4],
    category: 'furniture', thumbnail: '', src: '/models/bench.glb',
  },
]

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

// The binding belongs to the placed item ID, outside the graph and clipboard.
export function layoutDocument(scene, bindings) {
  // Pascal's autosave omits this transient flag. Plugin IDs travel in installedPlugins.
  const { hasExplicitPluginInstallState: _editorFlag, ...savedScene } = scene
  return {
    version: 1,
    id: layoutId,
    scene: savedScene,
    bindings: Object.fromEntries(Object.entries(bindings).filter(([id]) => scene.nodes[id]?.type === 'item')),
  }
}
