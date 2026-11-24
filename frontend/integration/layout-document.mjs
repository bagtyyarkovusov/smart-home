const LAYOUT_ID = 'week-13'
export const LAYOUT_PATH = `/api/layouts/${LAYOUT_ID}`
export const DEFAULT_ROOM_ID = 'room-1'
const LAMP_DEVICE_ID = 'lamp-7'
export const SAMPLE_LAMP = {
  name: 'Sample Floor Lamp',
  type: 'furniture',
  subType: 'lamp',
  deviceId: LAMP_DEVICE_ID,
  width: 40,
  height: 20,
  depth: 120,
  color: '#FBBF24',
  icon: 'LAMP',
  price: 0,
}

export class InvalidLayoutError extends Error {}

const isId = (value) => typeof value === 'string' && value.trim().length > 0
const isPoint = (value) =>
  Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])

const isSampleLamp = (object) =>
  object.type === SAMPLE_LAMP.type && object.subType === SAMPLE_LAMP.subType &&
  object.deviceId === LAMP_DEVICE_ID

export function validateLayout(layout) {
  if (layout?.version !== 1 || layout.id !== LAYOUT_ID ||
      !Array.isArray(layout.rooms) || layout.rooms.length !== 1) {
    throw new InvalidLayoutError('Expected layout week-13, version 1, with one room.')
  }
  const [room] = layout.rooms
  if (!isId(room?.id) || !Array.isArray(room.walls) || room.walls.length !== 1 ||
      !Array.isArray(room.items) || room.items.length !== 1) {
    throw new InvalidLayoutError('Keep exactly one wall and one Sample Floor Lamp on the plan.')
  }
  const [wall] = room.walls
  const [item] = room.items
  if (!isId(wall?.id) || !isPoint(wall.start) || !isPoint(wall.end) ||
      wall.start.every((value, axis) => value === wall.end[axis])) {
    throw new InvalidLayoutError('The wall needs two different, finite endpoints.')
  }
  if (!isId(item?.id) || item.id === wall.id || item.templateId !== 'floor-lamp' ||
      item.deviceId !== LAMP_DEVICE_ID || !isPoint(item.position) ||
      !Number.isFinite(item.rotationDeg)) {
    throw new InvalidLayoutError('Use a Sample Floor Lamp with a unique ID and a valid position and rotation.')
  }
  return layout
}

export function toLayoutDocument(objects, roomId = DEFAULT_ROOM_ID) {
  const walls = []
  const items = []
  for (const object of objects) {
    if (object.type === 'wall') {
      walls.push({ id: object.id, start: object.start, end: object.end })
    } else if (isSampleLamp(object)) {
      if (object.width !== SAMPLE_LAMP.width || object.height !== SAMPLE_LAMP.height ||
          object.depth !== SAMPLE_LAMP.depth) {
        throw new InvalidLayoutError('Set the Sample Floor Lamp dimensions to 40 × 20 × 120 cm.')
      }
      items.push({
        id: object.id, templateId: 'floor-lamp', deviceId: object.deviceId,
        position: [object.x, object.y], rotationDeg: object.rotation,
      })
    } else {
      throw new InvalidLayoutError(`Remove ${object.name || object.type} from the plan. Keep one wall and one Sample Floor Lamp.`)
    }
  }
  return validateLayout({ version: 1, id: LAYOUT_ID, rooms: [{ id: roomId, walls, items }] })
}

export function fromLayoutDocument(layout) {
  const [room] = validateLayout(layout).rooms
  const [wall] = room.walls
  const [item] = room.items
  return {
    roomId: room.id,
    objects: [
      {
        id: wall.id, start: wall.start, end: wall.end,
        type: 'wall', name: 'Wall', thickness: 10, price: 5000, zIndex: 0,
      },
      {
        ...SAMPLE_LAMP, id: item.id, deviceId: item.deviceId,
        x: item.position[0], y: item.position[1], rotation: item.rotationDeg, zIndex: 1,
      },
    ],
  }
}

// Earlier mock files used native Home3D objects and the original lamp dimensions.
export function readStoredLayout(layout) {
  if (layout?.id !== undefined || layout?.rooms !== undefined) return validateLayout(layout)
  if (layout?.version === 1 && typeof layout.projectName === 'string' && Array.isArray(layout.objects)) {
    const objects = layout.objects.map((object) => isSampleLamp(object)
      ? { ...object, width: SAMPLE_LAMP.width, height: SAMPLE_LAMP.height, depth: SAMPLE_LAMP.depth,
          rotation: object.rotation ?? 0 }
      : object)
    return toLayoutDocument(objects)
  }
  return validateLayout(layout)
}
