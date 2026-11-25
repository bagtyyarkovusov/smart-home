import { readFile, writeFile } from 'node:fs/promises'

// The published editor ships TSX and a tsconfig that extends an unpublished
// monorepo config. Give the Next compiler the JSX setting it needs.
const path = new URL('../node_modules/@pascal-app/editor/tsconfig.json', import.meta.url)
const config = JSON.parse(await readFile(path, 'utf8'))
if (config.extends === '@pascal/typescript-config/react-library.json') {
  delete config.extends
  delete config.compilerOptions.types
  config.compilerOptions.jsx = 'react-jsx'
  await writeFile(path, JSON.stringify(config, null, 2) + '\n')
}

// Pascal stores metres. Display the item inspector's position sliders in centimetres.
const panelPath = new URL('../node_modules/@pascal-app/nodes/dist/item/panel.js', import.meta.url)
const source = await readFile(panelPath, 'utf8')
let panel = source
for (const axis of [0, 1, 2]) {
  const position = [0, 1, 2].map((index) => axis === index ? 'value' : `node.position[${index}]`)
  const field = `value: node.position[${axis}]`
  const update = `onChange: (value) => handleUpdate({ position: [${position.join(', ')}] })`
  const original = `max: node.position[${axis}] + 2, min: node.position[${axis}] - 2, ${update}, precision: 2, step: 0.01, unit: "m", ${field}`
  position[axis] = 'value / 100'
  const centimetres = `max: node.position[${axis}] * 100 + 200, min: node.position[${axis}] * 100 - 200, onChange: (value) => handleUpdate({ position: [${position.join(', ')}] }), precision: 0, step: 1, unit: "cm", ${field} * 100`
  if (panel.includes(centimetres)) continue
  if (!panel.includes(original)) throw new Error('Pascal item inspector changed. Recheck its position controls.')
  panel = panel.replace(original, centimetres)
}
if (source !== panel) await writeFile(panelPath, panel)
