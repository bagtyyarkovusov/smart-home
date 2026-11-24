import { LAYOUT_PATH, validateLayout } from './layout-document.mjs'

export function createLayoutClient(endpoint = LAYOUT_PATH, { failFirstSave = false, fetchLayout = fetch } = {}) {
  async function request(options) {
    const response = await fetchLayout(endpoint, { cache: 'no-store', ...options })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const layout = await response.json()
    return layout === null && !options ? null : validateLayout(layout)
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
