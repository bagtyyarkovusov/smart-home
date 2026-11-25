import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('Pascal toolbar and room-inspector images are present as local WebP files', () => {
  for (const name of ['select', 'blueprint', 'rotate', 'topview', 'wallcut', 'mesh', 'floor', 'ceiling']) {
    const bytes = readFileSync(new URL(`../public/icons/${name}.webp`, import.meta.url))
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', name)
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', name)
  }
})
