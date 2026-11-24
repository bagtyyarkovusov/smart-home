import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { InvalidLayoutError, LAYOUT_PATH, readStoredLayout, validateLayout } from './layout-document.mjs'

const MAX_BODY_BYTES = 1024 * 1024

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

const sendError = (response, status, code, message) =>
  send(response, status, { error: { code, message } })

export function createMockLayoutHandler(file) {
  return async (request, response, next) => {
    if (request.url?.split('?')[0] !== LAYOUT_PATH) {
      return next ? next() : sendError(response, 404, 'layout_not_found', 'No layout has been saved.')
    }

    try {
      if (request.method === 'GET') {
        const raw = await readFile(file, 'utf8').catch((error) => {
          if (error.code === 'ENOENT') return null
          throw error
        })
        if (raw === null) return sendError(response, 404, 'layout_not_found', 'No layout has been saved.')
        return send(response, 200, readStoredLayout(JSON.parse(raw)))
      }
      if (request.method !== 'PUT') {
        response.setHeader('Allow', 'GET, PUT')
        return sendError(response, 405, 'method_not_allowed', 'Method not allowed.')
      }
      const chunks = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size <= MAX_BODY_BYTES) chunks.push(chunk)
      }
      if (size > MAX_BODY_BYTES) return sendError(response, 422, 'invalid_layout', 'Layout is too large.')

      let layout
      try {
        layout = validateLayout(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        if (!(error instanceof InvalidLayoutError || error instanceof SyntaxError)) throw error
        const message = error instanceof InvalidLayoutError ? error.message : 'Expected a JSON layout document.'
        return sendError(response, 422, 'invalid_layout', message)
      }

      if (request.headers['x-mock-fail-save'] === '1') {
        return sendError(response, 500, 'layout_save_failed', 'Could not save the layout. Try again.')
      }

      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify(layout), { flag: 'wx' })
        await rename(temporary, file)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {})
        throw error
      }
      return send(response, 200, layout)
    } catch (error) {
      console.error('Mock layout request failed:', error.message)
      return request.method === 'PUT'
        ? sendError(response, 500, 'layout_save_failed', 'Could not save the layout. Try again.')
        : sendError(response, 500, 'layout_load_failed', 'Could not load the saved layout.')
    }
  }
}

export function mockLayoutPlugin(file) {
  const attach = (server) => { server.middlewares.use(createMockLayoutHandler(file)) }
  return { name: 'smart-home-mock-layout', configureServer: attach, configurePreviewServer: attach }
}
