import { BuildingNode, DoorNode, ItemNode, LevelNode, SiteNode, WallNode, ZoneNode } from '@pascal-app/core'

export const layoutId = 'pascal-evaluation'
export const lampId = 'item_demo-lamp'
export const deviceId = 'lamp-7'
const levelId = 'level_demo'
const dividerId = 'wall_divider'

function asset(name, id, dimensions) {
  return {
    name, id, dimensions, category: 'furniture', thumbnail: '',
    src: `/models/${id}.glb`,
  }
}

export const stool = asset('Oak stool', 'stool', [0.48, 0.45, 0.48])
const floorLamp = asset('Floor lamp', 'floor-lamp', [0.4, 1.2, 0.32])

export function startingScene({ blank = false } = {}) {
  const door = DoorNode.parse({
    id: 'door_between-rooms', wallId: dividerId, parentId: dividerId,
    name: 'Connecting door', position: [2.4, 0, 0], verticalAnchor: 'floor',
    width: 0.9, operationState: 0.8,
  })
  const walls = [
    ['living-north', [-4, -2.5], [0, -2.5]],
    ['study-north', [0, -2.5], [4, -2.5]],
    ['study-east', [4, -2.5], [4, 2.5]],
    ['study-south', [4, 2.5], [0, 2.5]],
    ['living-south', [0, 2.5], [-4, 2.5]],
    ['living-west', [-4, 2.5], [-4, -2.5]],
    ['divider', [0, -2.5], [0, 2.5]],
  ].map(([name, start, end]) => WallNode.parse({
    id: `wall_${name}`, parentId: levelId, start, end,
    height: 2.4, thickness: 0.15, slots: { a: '#F8F5F1', b: '#F8F5F1' },
    children: name === 'divider' ? [door.id] : [],
  }))
  const rooms = [
    ['living', 'Living room', -4, 0, [0, 4, 5, 6]],
    ['study', 'Study', 0, 4, [1, 2, 3, 6]],
  ].map(([key, name, left, right, boundary]) => ZoneNode.parse({
    id: `zone_${key}`, name, parentId: levelId, spaceRole: 'room',
    polygon: [[left, -2.5], [right, -2.5], [right, 2.5], [left, 2.5]],
    seed: [(left + right) / 2, 0], autoFromWalls: true,
    boundaryWallIds: boundary.map((index) => walls[index].id),
    color: '#2457b8', hasCeiling: false,
  }))
  const lamp = ItemNode.parse({
    id: lampId, name: floorLamp.name, parentId: levelId, asset: floorLamp,
    position: [-2.7, 0, 0.9], rotation: [0, -Math.PI / 6, 0],
  })
  const children = blank ? [] : [...walls, ...rooms, lamp]
  const level = LevelNode.parse({ id: levelId, parentId: 'building_demo', children: children.map(({ id }) => id) })
  const building = BuildingNode.parse({ id: 'building_demo', parentId: 'site_demo', children: [level.id] })
  const site = SiteNode.parse({ id: 'site_demo', children: [building.id], showGround: false })
  const nodes = [site, building, level, ...children, ...(blank ? [] : [door])]
  return { nodes: Object.fromEntries(nodes.map((node) => [node.id, node])), rootNodeIds: [site.id] }
}

// Pascal duplicates item nodes and templates. The device link belongs to the
// original placed-item ID, outside the graph and outside the clipboard.
export function layoutDocument(scene, bindings) {
  return {
    version: 1,
    id: layoutId,
    scene,
    bindings: Object.fromEntries(Object.entries(bindings).filter(([id]) => scene.nodes[id]?.type === 'item')),
  }
}

export const startingBindings = { [lampId]: deviceId }
