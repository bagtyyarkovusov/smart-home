import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Box3, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// Repack the vendor files listed in the runbook. Images stay standard JPEGs
// inside the GLB so Pascal needs neither a texture host nor a decoder.
const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/pack-room-models.mjs <source directory>')
const output = new URL('../public/models/', import.meta.url)
const temp = await mkdtemp(join(tmpdir(), 'pascal-models-'))
const loader = new GLTFLoader().register(() => ({
  name: 'Measure geometry without decoding images',
  loadTexture: () => Promise.resolve(null),
}))

function aligned(bytes, fill = 0) {
  return Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, fill)])
}

function glb(document, binary) {
  document.buffers = [{ byteLength: binary.length }]
  const json = aligned(Buffer.from(JSON.stringify(document)), 0x20)
  const header = Buffer.alloc(20)
  header.write('glTF')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + json.length + binary.length, 8)
  header.writeUInt32LE(json.length, 12)
  header.write('JSON', 16)
  const chunk = Buffer.alloc(8)
  chunk.writeUInt32LE(binary.length)
  chunk.write('BIN', 4)
  return Buffer.concat([header, json, chunk, binary])
}

async function normalize(document, binary, name, dimensions, rotation) {
  const root = document.scenes[document.scene ?? 0]
  if (rotation) {
    const index = document.nodes.length
    document.nodes.push({ children: root.nodes, rotation })
    root.nodes = [index]
  }
  const file = glb(document, binary)
  const { scene } = await loader.parseAsync(Uint8Array.from(file).buffer, '')
  const bounds = new Box3().setFromObject(scene, true)
  const size = bounds.getSize(new Vector3()).toArray()
  const [x, , z] = bounds.getCenter(new Vector3()).toArray()
  const scale = size.map((length, axis) => dimensions[axis] / length)
  const index = document.nodes.length
  document.nodes.push({
    name, children: root.nodes, scale,
    translation: [-x * scale[0], -bounds.min.y * scale[1], -z * scale[2]],
  })
  root.nodes = [index]
  await writeFile(new URL(`${name}.glb`, output), glb(document, binary))
}

async function packPolyHaven(folder, name, dimensions, rotation) {
  const directory = join(source, folder)
  const document = JSON.parse(await readFile(join(directory, 'source.gltf'), 'utf8'))
  const buffers = [aligned(await readFile(join(directory, document.buffers[0].uri)))]
  const images = new Map()
  for (const image of document.images) {
    if (!images.has(image.uri)) {
      const texture = join(temp, 'texture.jpg')
      execFileSync('sips', ['-Z', '512', '-s', 'formatOptions', '82',
        join(directory, image.uri), '--out', texture])
      const bytes = await readFile(texture)
      const byteOffset = buffers.reduce((total, buffer) => total + buffer.length, 0)
      images.set(image.uri, document.bufferViews.length)
      document.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length })
      buffers.push(aligned(bytes))
    }
    image.bufferView = images.get(image.uri)
    delete image.uri
  }
  await normalize(document, Buffer.concat(buffers), name, dimensions, rotation)
}

try {
  await packPolyHaven('mid_century_lounge_chair', 'lounge-chair', [1, 1.17, 1.19])
  await packPolyHaven('modern_coffee_table_01', 'coffee-table', [1.2, 0.39, 0.6],
    [0, Math.SQRT1_2, 0, Math.SQRT1_2])
  await packPolyHaven('potted_plant_04', 'potted-plant', [0.17, 0.27, 0.19])

  const lamp = await readFile(join(source, 'kenney-lamp.glb'))
  const jsonEnd = 20 + lamp.readUInt32LE(12)
  const document = JSON.parse(lamp.toString('utf8', 20, jsonEnd))
  const [stem, shade] = document.materials.map((material) => material.pbrMetallicRoughness)
  stem.baseColorFactor = [0.35, 0.21, 0.09, 1]
  stem.metallicFactor = 0.55
  stem.roughnessFactor = 0.38
  shade.baseColorFactor = [0.86, 0.72, 0.52, 1]
  await normalize(document, lamp.subarray(jsonEnd + 8), 'linen-floor-lamp', [0.4, 1.2, 0.2])
} finally {
  await rm(temp, { recursive: true, force: true })
}
