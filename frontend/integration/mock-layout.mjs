import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { LAYOUT_PATH, validateLayout } from './layout-document.mjs'

const MAX_BODY_BYTES = 1024 * 1024

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

export function createMockLayoutHandler(file) {
  return async (request, response, next) => {
    if (request.url?.split('?')[0] !== LAYOUT_PATH) {
      return next ? next() : send(response, 404, { error: 'Not found' })
    }

    try {
      if (request.method === 'GET') {
        const raw = await readFile(file, 'utf8').catch((error) => {
          if (error.code === 'ENOENT') return null
          throw error
        })
        return send(response, 200, raw === null ? null : validateLayout(JSON.parse(raw)))
      }
      if (request.method !== 'PUT') {
        response.setHeader('Allow', 'GET, PUT')
        return send(response, 405, { error: 'Method not allowed' })
      }
      if (request.headers['x-mock-fail-save'] === '1') {
        request.resume()
        return send(response, 503, { error: 'Simulated save failure' })
      }

      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size <= MAX_BODY_BYTES) chunks.push(chunk)
      }
      if (size > MAX_BODY_BYTES) return send(response, 413, { error: 'Layout is too large' })

      let layout
      try {
        layout = validateLayout(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        return send(response, 400, { error: error.message })
      }

      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify(layout), { flag: 'wx' })
        await rename(temporary, file)
      } finally {
        await rm(temporary, { force: true })
      }
      return send(response, 200, layout)
    } catch (error) {
      console.error('Mock layout request failed:', error.message)
      return send(response, 500, { error: 'Mock layout storage is unavailable' })
    }
  }
}

export function mockLayoutPlugin(file) {
  const attach = (server) => { server.middlewares.use(createMockLayoutHandler(file)) }
  return { name: 'smart-home-mock-layout', configureServer: attach, configurePreviewServer: attach }
}
