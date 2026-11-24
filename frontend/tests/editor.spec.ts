import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PerspectiveCamera, Vector3 } from 'three'

const layoutPath = '/api/layouts/demo-room'

async function drag(page: Page, item: Locator, target: { x: number; y: number }) {
  const box = await item.boundingBox()
  if (!box) throw new Error('Item is not visible')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 12 })
  await page.mouse.up()
}

async function capture(page: Page, file: string) {
  const dir = process.env.SMART_HOME_EVIDENCE_DIR
  if (!dir) return
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: join(dir, file) })
}

test('draws, moves, rotates and reopens the sample lamp through the mock API', async ({ page }) => {
  const initialFetch = page.waitForResponse((response) => response.url().endsWith(layoutPath))
  await page.goto('/?failSave=1')
  expect(await (await initialFetch).json()).toBeNull()

  const canvas = page.getByTestId('canvas-2d')
  const lamp = page.getByTestId('canvas-object-lamp')
  const wall = page.getByTestId('canvas-object-wall')
  await expect(wall).toHaveCount(0)
  await expect(lamp).toHaveCount(0)
  await page.getByTestId('wall-tool-toggle').click()
  await canvas.click({ position: { x: 120, y: 140 } })
  await canvas.click({ position: { x: 560, y: 160 } })
  await page.getByTestId('wall-tool-toggle').click()
  await expect(wall).toHaveCount(1)

  await page.getByTestId('sidebar-category-furniture').click()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('2D floor plan is not visible')
  await drag(page, page.getByTestId('catalog-item-sample-floor-lamp'), { x: box.x + 300, y: box.y + 300 })
  await expect(lamp).toHaveCSS('left', '300px')
  await drag(page, lamp, { x: box.x + 460, y: box.y + 360 })
  await expect(lamp).toHaveCSS('left', '460px')
  await expect(lamp).toHaveCSS('top', '360px')
  const rotation = page.getByRole('slider', { name: 'Rotation' })
  for (let step = 0; step < 3; step += 1) await rotation.press('ArrowRight')
  await expect(rotation).toHaveValue('45')
  const placedId = await lamp.getAttribute('data-object-id')

  const failedSave = page.waitForResponse((response) =>
    response.url().endsWith(layoutPath) && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Save layout' }).click()
  expect((await failedSave).status()).toBe(503)
  await expect(page.getByRole('alert')).toContainText('Your edits are still here')
  await expect(lamp).toHaveCSS('left', '460px')
  await expect(wall).toHaveCount(1)
  await capture(page, '01-save-error.png')

  const goodSave = page.waitForResponse((response) =>
    response.url().endsWith(layoutPath) && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Retry save' }).click()
  const response = await goodSave
  expect(response.status()).toBe(200)
  const saved = await response.json()
  expect(saved.objects).toEqual([
    expect.objectContaining({ type: 'wall', start: [120, 140], end: [560, 160] }),
    expect.objectContaining({ id: placedId, deviceId: 'lamp-7', x: 460, y: 360, rotation: 45 }),
  ])
  await expect(page.getByRole('status')).toHaveText('Layout saved')
  await capture(page, '02-saved-2d.png')

  const reopenedFetch = page.waitForResponse((result) =>
    result.url().endsWith(layoutPath) && result.request().method() === 'GET')
  await page.reload()
  const reopened = await reopenedFetch
  expect(reopened.status()).toBe(200)
  expect(await reopened.json()).toEqual(saved)
  await expect(wall).toHaveCount(1)
  await expect(lamp).toHaveAttribute('data-object-id', placedId!)
  await expect(lamp).toHaveCSS('left', '460px')
  await expect(lamp).toHaveCSS('top', '360px')
  expect(await wall.evaluate((element) => {
    const style = getComputedStyle(element)
    const rotation = new DOMMatrixReadOnly(style.transform)
    const x = parseFloat(style.left)
    const y = parseFloat(style.top) + parseFloat(style.height) / 2
    const length = parseFloat(style.width)
    return [x, y, Math.round(x + length * rotation.a), Math.round(y + length * rotation.b)]
  })).toEqual([120, 140, 560, 160])
  await lamp.click()
  await expect(rotation).toHaveValue('45')
  await capture(page, '03-reopened-2d.png')

  await page.getByTestId('view-toggle-3d').click()
  const scene = page.getByTestId('canvas-3d').locator('canvas')
  await expect(scene).toBeVisible()
  await expect.poll(() => scene.evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    return Boolean(canvas.getContext('webgl2'))
  })).toBe(true)
  const sceneBox = await scene.boundingBox()
  if (!sceneBox) throw new Error('3D viewport is not visible')
  const camera = new PerspectiveCamera(45, sceneBox.width / sceneBox.height)
  camera.position.set(10, 10, 10)
  camera.lookAt(3, 0, 3)
  camera.updateMatrixWorld()
  // The expected 460 cm / 360 cm plan coordinates map to X 4.6 m / Z 3.6 m.
  async function clickWorldPoint(x: number, y: number, z: number) {
    const projected = new Vector3(x, y, z).project(camera)
    await scene.click({ position: {
      x: (projected.x + 1) * sceneBox!.width / 2,
      y: (1 - projected.y) * sceneBox!.height / 2,
    } })
  }
  await clickWorldPoint(3.4, 1.5, 1.5)
  await expect(page.getByRole('heading', { name: 'Wall', exact: true })).toBeVisible()
  await clickWorldPoint(4.6, 1.35, 3.6)
  await expect(page.getByRole('heading', { name: 'Sample Floor Lamp', exact: true })).toBeVisible()
  await expect(rotation).toHaveValue('45')
  await capture(page, '04-reopened-3d.png')
  console.log('Mock layout: GET 200 (blank) → PUT 503 → PUT 200 → GET 200 (reload)', JSON.stringify(saved))
})
