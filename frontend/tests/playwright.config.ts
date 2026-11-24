import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const dataDir = mkdtempSync(join(tmpdir(), 'smart-home-editor-'))
process.once('exit', () => rmSync(dataDir, { recursive: true, force: true }))

export default defineConfig({
  testDir: '.',
  testMatch: 'editor.spec.ts',
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    baseURL: 'http://127.0.0.1:4173',
    channel: process.env.SMART_HOME_BROWSER_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://127.0.0.1:4173/api/layouts/demo-room',
    env: { SMART_HOME_MOCK_LAYOUT_FILE: join(dataDir, 'layout.json') },
  },
})
