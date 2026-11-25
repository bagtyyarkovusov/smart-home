import { fileURLToPath } from 'node:url'

const config = {
  agentRules: false,
  devIndicators: false,
  images: { unoptimized: true },
  turbopack: { root: fileURLToPath(new URL('..', import.meta.url)) },
  transpilePackages: ['three', '@pascal-app/core', '@pascal-app/editor', '@pascal-app/viewer', '@pascal-app/nodes'],
}

export default config
