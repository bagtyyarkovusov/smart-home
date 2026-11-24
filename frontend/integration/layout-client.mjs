import { LAYOUT_PATH, InvalidLayoutError, validateLayout } from './layout-document.mjs'

export function createLayoutClient(endpoint = LAYOUT_PATH, { failFirstSave = false, fetchLayout = fetch } = {}) {
  async function request(options) {
    const response = await fetchLayout(endpoint, { cache: 'no-store', ...options })
    const data = await response.json()
    if (!response.ok) {
      const code = data?.error?.code
      if (!options && response.status === 404 && code === 'layout_not_found') return null
      if (response.status === 422 && code === 'invalid_layout') {
        throw new InvalidLayoutError(data.error.message)
      }
      throw new Error(`HTTP ${response.status}${code ? ` (${code})` : ''}`)
    }
    return validateLayout(data)
  }

  return {
    load: () => request(),
    async save(layout) {
      const body = JSON.stringify(validateLayout(layout))
      const headers = { 'Content-Type': 'application/json' }
      if (failFirstSave) {
        headers['X-Mock-Fail-Save'] = '1'
        failFirstSave = false
      }
      return request({ method: 'PUT', headers, body })
    },
  }
}
