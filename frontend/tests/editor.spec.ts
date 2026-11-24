import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LAYOUT_PATH } from '../smart-home/layout-document.mjs'

const fixture = JSON.parse(await readFile(new URL('./layout.v1.json', import.meta.url), 'utf8'))
const [fixtureWall] = fixture.rooms[0].walls
const [fixtureLamp] = fixture.rooms[0].items
const fixtureWallScene = { position: [1.7, 1.5, 2.4], axis: [0.6, 0, 0.8], size: [5, 3, 0.1] }

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

function layoutResponse(page: Page, method: 'GET' | 'PUT') {
  return page.waitForResponse((response) =>
    new URL(response.url()).pathname === LAYOUT_PATH && response.request().method() === method)
}

type SceneObject = {
  position: number[]
  axis: number[]
  size: number[]
  screen: { x: number; y: number }
}

async function inspectSceneObject(canvas: Locator, id: string) {
  const read = () => canvas.evaluate((element, objectId) => {
    const probe = element as HTMLCanvasElement & {
      inspectLayoutObject?: (id: string) => SceneObject | null
    }
    return probe.inspectLayoutObject?.(objectId) ?? null
  }, id)
  await expect.poll(read).not.toBeNull()
  const object = await read()
  if (!object) throw new Error(`3D scene object disappeared: ${id}`)
  return object
}

function expectVector(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 5))
}

async function expectLampPosition(lamp: Locator, [x, y]: number[]) {
  await expect(lamp).toHaveCSS('left', `${x}px`)
  await expect(lamp).toHaveCSS('top', `${y}px`)
}

async function expect2D(
  page: Page,
  savedWall: { id: string; start: number[]; end: number[] },
  savedLamp: { id: string; position: number[]; rotationDeg: number },
) {
  const wall = page.getByTestId('canvas-object-wall')
  const lamp = page.getByTestId('canvas-object-lamp')
  await expect(wall).toHaveAttribute('data-object-id', savedWall.id)
  await expect(lamp).toHaveAttribute('data-object-id', savedLamp.id)
  await expectLampPosition(lamp, savedLamp.position)
  await expect(lamp).toHaveCSS('width', '40px')
  await expect(lamp).toHaveCSS('height', '20px')
  expect(await wall.evaluate((element) => {
    const style = getComputedStyle(element)
    const rotation = new DOMMatrixReadOnly(style.transform)
    const x = parseFloat(style.left)
    const y = parseFloat(style.top) + parseFloat(style.height) / 2
    const length = parseFloat(style.width)
    return [x, y, Math.round(x + length * rotation.a), Math.round(y + length * rotation.b)]
  })).toEqual([...savedWall.start, ...savedWall.end])
  await lamp.click()
  const angle = await lamp.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)
    return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
  })
  expect(angle).toBeCloseTo(savedLamp.rotationDeg, 3)
}

async function expect3D(
  page: Page,
  wallId: string, wallScene: Omit<SceneObject, 'screen'>,
  lampId: string, lampPosition: number[], lampAxis: number[],
) {
  await page.getByTestId('view-toggle-3d').click()
  const canvas = page.getByTestId('canvas-3d').locator('canvas')
  await expect(canvas).toBeVisible()
  const wall = await inspectSceneObject(canvas, wallId)
  expectVector(wall.position, wallScene.position)
  expectVector(wall.axis, wallScene.axis)
  expectVector(wall.size, wallScene.size)
  const lamp = await inspectSceneObject(canvas, lampId)
  expectVector(lamp.position, lampPosition)
  expectVector(lamp.axis, lampAxis)
  expectVector(lamp.size, [0.4, 1.2, 0.2])

  // Keep the user interaction check and aim using the camera that rendered the scene.
  await canvas.click({ position: wall.screen })
  await expect(page.getByRole('heading', { name: 'Wall', exact: true })).toBeVisible()
}

test('round-trips a plan created in the editor and retries a failed fixture edit', async ({ page }) => {
  const initialFetch = layoutResponse(page, 'GET')
  await page.goto('/')
  const missing = await initialFetch
  expect(missing.status()).toBe(404)
  expect(await missing.json()).toMatchObject({ error: { code: 'layout_not_found' } })
  const canvas = page.getByTestId('canvas-2d')
  const lamp = page.getByTestId('canvas-object-lamp')
  const wall = page.getByTestId('canvas-object-wall')
  await expect(canvas).toBeVisible()
  await expect(wall).toHaveCount(0)
  await expect(lamp).toHaveCount(0)

  await page.getByTestId('wall-tool-toggle').click()
  await canvas.click({ position: { x: 120, y: 140 } })
  await canvas.click({ position: { x: 560, y: 140 } })
  await page.getByTestId('wall-tool-toggle').click()
  await expect(wall).toHaveCount(1)
  const save = page.getByRole('button', { name: 'Save layout', exact: true })
  await save.click()
  await expect(page.getByRole('alert')).toContainText('Keep exactly one wall and one Sample Floor Lamp')
  await expect(wall).toHaveCount(1)

  await page.getByTestId('sidebar-category-furniture').click()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('2D floor plan is not visible')
  await drag(page, page.getByTestId('catalog-item-sample-floor-lamp'), { x: box.x + 300, y: box.y + 300 })
  await expectLampPosition(lamp, [300, 300])
  const wallId = await wall.getAttribute('data-object-id')
  const lampId = await lamp.getAttribute('data-object-id')
  if (!wallId || !lampId) throw new Error('The editor did not generate wall and lamp IDs')
  expect(wallId).not.toBe(lampId)

  await drag(page, lamp, { x: box.x + 420, y: box.y + 340 })
  const rotation = page.getByRole('slider', { name: 'Rotation' })
  await rotation.press('ArrowRight')
  await rotation.press('ArrowRight')
  await expect(rotation).toHaveValue('30')
  const createdWall = { id: wallId, start: [120, 140], end: [560, 140] }
  const createdLamp = {
    id: lampId, templateId: 'floor-lamp', deviceId: 'lamp-7', position: [420, 340], rotationDeg: 30,
  }
  const created = { version: 1, id: 'week-13', rooms: [{ id: 'room-1', walls: [createdWall], items: [createdLamp] }] }
  await expect2D(page, createdWall, createdLamp)
  await expect.soft(page.getByText('Fixed by the lamp template', { exact: true })).toBeVisible({ timeout: 1000 })
  expect.soft(await page.locator('.color-swatch').count()).toBe(0)
  await capture(page, '00-created-edited-2d.png')

  const createdSave = layoutResponse(page, 'PUT')
  await save.click()
  const saved = await createdSave
  expect(saved.status()).toBe(200)
  expect(saved.request().postDataJSON()).toEqual(created)
  expect(await saved.json()).toEqual(created)
  await expect(page.getByRole('status')).toHaveText('Layout saved')

  const createdFetch = layoutResponse(page, 'GET')
  await page.reload()
  const reloaded = await createdFetch
  expect(reloaded.status()).toBe(200)
  expect(await reloaded.json()).toEqual(created)
  await expect2D(page, createdWall, createdLamp)
  await capture(page, '00-created-reopened-2d.png')
  await expect3D(page, wallId, { position: [3.4, 1.5, 1.4], axis: [1, 0, 0], size: [4.4, 3, 0.1] },
    lampId, [4.2, 0, 3.4], [0.8660254, 0, 0.5])
  await capture(page, '00-created-reopened-3d.png')

  const invalid = await page.request.put(LAYOUT_PATH, { data: { ...fixture, version: 2 } })
  expect(invalid.status()).toBe(422)
  expect(await invalid.json()).toMatchObject({ error: { code: 'invalid_layout' } })

  const seeded = await page.request.put(LAYOUT_PATH, { data: fixture })
  expect(seeded.status()).toBe(200)
  expect(await seeded.json()).toEqual(fixture)
  const fixtureFetch = layoutResponse(page, 'GET')
  await page.goto('/?failSave=1')
  const loaded = await fixtureFetch
  expect(loaded.status()).toBe(200)
  expect(await loaded.json()).toEqual(fixture)
  await expect2D(page, fixtureWall, fixtureLamp)
  await expect3D(page, fixtureWall.id, fixtureWallScene, fixtureLamp.id, [1.2, 0, 0.8], [0.8660254, 0, 0.5])
  await page.getByTestId('view-toggle-2d').click()

  const editor = await canvas.boundingBox()
  if (!editor) throw new Error('2D floor plan is not visible')
  // Keep the drag clear of the fixture wall's collision bounds.
  await drag(page, lamp, { x: editor.x + 380, y: editor.y + 80 })
  const movedLamp = { ...fixtureLamp, position: [380, 80], rotationDeg: 45 }
  await expectLampPosition(lamp, movedLamp.position)
  await rotation.press('ArrowRight')
  await expect(rotation).toHaveValue('45')

  const failedSave = layoutResponse(page, 'PUT')
  await save.click()
  const failure = await failedSave
  expect(failure.status()).toBe(500)
  expect(await failure.json()).toMatchObject({ error: { code: 'layout_save_failed' } })
  const alert = page.getByRole('alert')
  const retryButton = page.getByRole('button', { name: 'Retry save', exact: true })
  const hint = canvas.getByText('Scroll to zoom • Space + drag to pan', { exact: true })
  await expect(alert).toContainText('Your edits are still here')
  await expect(retryButton).toBeVisible()
  await expect(hint).toBeVisible()
  const hintBox = await hint.boundingBox()
  if (!hintBox) throw new Error('The canvas hint is not visible')
  for (const feedback of [alert, retryButton]) {
    const bounds = await feedback.boundingBox()
    if (!bounds) throw new Error('Save feedback is not visible')
    expect.soft(bounds.y + bounds.height, 'Save feedback clears the canvas hint').toBeLessThanOrEqual(hintBox.y)
  }
  await expectLampPosition(lamp, movedLamp.position)
  await expect(rotation).toHaveValue('45')
  const stillSaved = await page.request.get(LAYOUT_PATH)
  expect(stillSaved.status()).toBe(200)
  expect(await stillSaved.json()).toEqual(fixture)
  await capture(page, '01-save-failed.png')

  const retry = layoutResponse(page, 'PUT')
  await retryButton.focus()
  await expect(retryButton).toBeFocused()
  await retryButton.press('Enter')
  const replaced = await retry
  expect(replaced.status()).toBe(200)
  const expected = structuredClone(fixture)
  expected.rooms[0].items[0] = movedLamp
  expect(failure.request().postDataJSON()).toEqual(expected)
  expect(replaced.request().postDataJSON()).toEqual(expected)
  expect(await replaced.json()).toEqual(expected)
  await expect(page.getByRole('status')).toHaveText('Layout saved')
  await capture(page, '02-retry-saved.png')

  const reopenedFetch = layoutResponse(page, 'GET')
  await page.reload()
  const reopened = await reopenedFetch
  expect(reopened.status()).toBe(200)
  expect(await reopened.json()).toEqual(expected)
  await expect2D(page, fixtureWall, movedLamp)
  await capture(page, '03-reopened-2d.png')
  await expect3D(page, fixtureWall.id, fixtureWallScene, fixtureLamp.id, [3.8, 0, 0.8], [0.7071068, 0, 0.7071068])
  await capture(page, '04-reopened-3d.png')
  console.log('Mock layout: blank GET 404 → editor PUT 200 → reload GET 200')
  console.log('Mock layout: invalid PUT 422 → fixture PUT 200 → GET 200 → failed PUT 500 → GET 200 → retry PUT 200 → reload GET 200')
})
