export const LAYOUT_PATH = '/api/layouts/demo-room'
export const LAMP_DEVICE_ID = 'lamp-7'

const isPoint = (value) =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)

// Keep the Home3D document lossless. Plan x/y and dimensions are in cm,
// while rotations are degrees. Home3D projects these onto the 3D X/Z plane.
export function validateLayout(layout) {
  if (layout?.version !== 1 || typeof layout.projectName !== 'string' || !Array.isArray(layout.objects)) {
    throw new Error('Expected a version 1 Home3D layout.')
  }

  const ids = new Set()
  let hasSampleLamp = false
  for (const object of layout.objects) {
    if (typeof object?.id !== 'string' || !object.id || ids.has(object.id)) {
      throw new Error('Every placed item and wall must have a unique ID.')
    }
    ids.add(object.id)
    if (object.type === 'wall') {
      if (!isPoint(object.start) || !isPoint(object.end)) throw new Error('Invalid wall endpoints.')
    } else if (!['furniture', 'door', 'window'].includes(object.type) ||
               ![object.x, object.y, object.rotation ?? 0].every(Number.isFinite)) {
      throw new Error('Invalid placed item geometry.')
    }
    if (object.deviceId !== undefined) {
      if (object.deviceId !== LAMP_DEVICE_ID || object.type !== 'furniture' ||
          object.subType !== 'lamp' || hasSampleLamp) {
        throw new Error('Expected at most one lamp-7 device link.')
      }
      hasSampleLamp = true
    }
  }
  return layout
}
