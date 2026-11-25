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
