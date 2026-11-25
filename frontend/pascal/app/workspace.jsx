import { ItemNode, loadPlugin, useScene } from '@pascal-app/core'
import { activateCatalogItem, applySceneGraphToEditor, Editor, getSavedSceneDocument, openEditorView, selectWallDrawVariant, useEditor, useFloorplanRender, useSelection } from '@pascal-app/editor'
import { builtinPlugin } from '@pascal-app/nodes'
import { configureViewer, useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { deviceId, floorLamp, importWeek13Layout, layoutDocument, layoutId, startingScene } from './scene.mjs'
import { api, useLamp } from './use-lamp'

const endpoint = `${api}/api/layouts/${layoutId}/pascal`
const lampDragType = 'application/x-smart-home-floor-lamp'
const LayoutToolsContext = createContext(null)
const sidebarTabs = [{ id: 'smart-home-layout', label: 'Layout tools', component: LayoutTools }]
const commandLabels = {
  pending: 'Command pending',
  succeeded: 'Command confirmed',
  timed_out: 'Command timed out',
  rejected: 'Command rejected',
}
const saveLabels = {
  idle: 'Ready', pending: 'Unsaved changes', saving: 'Saving…',
  saved: 'Saved', paused: 'Save paused', error: 'Save failed. Draft is still open.',
}

let plugin
export default function Workspace() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    configureViewer({ assetsBaseUrl: window.location.origin, iconsBaseUrl: '/icons' })
    plugin ??= loadPlugin(builtinPlugin)
    plugin.then(() => setReady(true), (failure) => setError(String(failure)))
  }, [])
  if (!ready) return <p>{error || 'Loading Pascal…'}</p>
  return <DemoEditor />
}

function PowerControls({ item, device, lamp }) {
  return <section className="power-panel" aria-label="Smart Home power">
    <strong>Smart Home power</strong>
    <p>{item.name} · {device}</p>
    <p role="status">Confirmed power · <b>{powerLabel(lamp.state)}</b></p>
    {lamp.state && <time dateTime={lamp.state.updatedAt}>{lamp.state.updatedAt}</time>}
    <div className="power-actions">
      {[true, false].map((value) => <button key={String(value)} onClick={() => lamp.requestPower(value)}
        disabled={!lamp.state || lamp.command?.status === 'pending'}>{value ? 'On' : 'Off'}</button>)}
    </div>
    {lamp.command && <p role="status">{commandLabels[lamp.command.status] ?? lamp.command.status}</p>}
    {lamp.error && <p role="alert">{lamp.error}</p>}
    {lamp.command?.status === 'pending' && (lamp.command.deviceId || lamp.error) && (
      <button onClick={lamp.checkCommandStatus}>Check command status</button>
    )}
  </section>
}

function powerLabel(state) {
  if (!state) return 'Unknown'
  return state.value ? 'On' : 'Off'
}

function powerDescription(state) {
  return state ? `Confirmed at ${state.updatedAt}` : 'Waiting for confirmed state'
}

function selectLamp(id, event) {
  event?.stopPropagation()
  useEditor.getState().setMode('select')
  useViewer.getState().setSelection({ zoneId: null, selectedIds: [id] })
}

function LayoutTools() {
  const { canPlace, placeLamp, placeAt } = useContext(LayoutToolsContext)
  const coordinates = useRef(null)
  return <section className="lamp-tools" aria-label="Layout tools" onKeyDown={(event) => {
    if (event.key === ' ' && event.target instanceof HTMLButtonElement) event.stopPropagation()
  }}>
    <button type="button" disabled={!canPlace} draggable={canPlace}
      aria-describedby="lamp-placement-help"
      onDragStart={(event) => {
        event.dataTransfer.setData(lampDragType, deviceId)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={(event) => {
        if (event.detail === 0) coordinates.current.focus()
        else placeLamp()
      }}>Add floor lamp</button>
    <p id="lamp-placement-help">Click or drag onto the plan, or enter coordinates.</p>
    <form onSubmit={(event) => {
      event.preventDefault()
      const fields = new FormData(event.currentTarget)
      placeAt(Number(fields.get('x')) / 100, Number(fields.get('z')) / 100)
    }}>
      <label>X (cm)<input ref={coordinates} name="x" type="number" step="any" defaultValue="0" required disabled={!canPlace} /></label>
      <label>Z (cm)<input name="z" type="number" step="any" defaultValue="0" required disabled={!canPlace} /></label>
      <button disabled={!canPlace}>Place at coordinates</button>
    </form>
  </section>
}

function LampPlan({ item, state }) {
  const render = useFloorplanRender()
  const [x, , z] = item.position
  const selecting = useEditor((editor) => editor.mode === 'select' || editor.mode === 'edit')
  const label = powerLabel(state)
  if (!render) return null
  const { unitsPerPixel: scale, sceneRotationDeg } = render
  return <g transform={`translate(${x} ${z})`} aria-label={`2D lamp power ${label}`}>
    <circle r={0.29} fill="none" stroke={state?.value ? '#c47a15' : '#2457b8'} strokeWidth={0.025} pointerEvents="none" />
    <g transform={`rotate(${-sceneRotationDeg}) translate(${scale * 14} ${scale * 12}) scale(${scale})`}>
      <g className="plan-power" role="button" tabIndex={selecting ? 0 : -1}
        aria-label={`Select floor lamp in 2D · ${label}`} aria-description={powerDescription(state)}
        pointerEvents={selecting ? 'auto' : 'none'}
        onClick={(event) => selectLamp(item.id, event)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            selectLamp(item.id, event)
          }
        }}>
        <title>{powerDescription(state)}</title>
        <rect x={0} y={0} width={44} height={21} rx={4} fill={state?.value ? '#ffe7a1' : '#fff'} stroke="#2457b8" />
        <text x={22} y={14} textAnchor="middle" fontSize={12} fill="#172a3a">{label}</text>
      </g>
    </g>
  </g>
}

function LampScene({ item, state }) {
  const selecting = useEditor((editor) => editor.mode === 'select' || editor.mode === 'edit')
  const label = powerLabel(state)
  return <group position={item.position}>
    {state?.value && <mesh position={[0, 1.22, 0]} raycast={() => null}>
      <sphereGeometry args={[0.1, 12, 8]} />
      <meshBasicMaterial color="#ffcf64" />
    </mesh>}
    <Html position={[0, 1.48, 0]} center style={{ pointerEvents: selecting ? 'auto' : 'none' }}>
      <button className="scene-power" data-on={Boolean(state?.value)} disabled={!selecting}
        onClick={(event) => selectLamp(item.id, event)}
        aria-label={`Select floor lamp in 3D · ${label}`} title={powerDescription(state)}
        aria-description={powerDescription(state)}>{label}</button>
    </Html>
  </group>
}

function DemoEditor() {
  const wallMode = useViewer((viewer) => viewer.wallMode)
  const lamp = useLamp()
  const [bindings, setBindings] = useState({})
  const bindingRef = useRef({})
  const writes = useRef(Promise.resolve())
  const [saveStatus, setSaveStatus] = useState('idle')
  const [hasSaved, setHasSaved] = useState(false)
  const [importError, setImportError] = useState('')
  const importInput = useRef(null)
  const placingLamp = useRef(null)
  const [loading, setLoading] = useState(true)
  const { selectedNode } = useSelection()
  const boundItem = useScene((scene) => scene.nodes[Object.keys(bindings)[0]])
  const hasWall = useScene((scene) => Object.values(scene.nodes).some((node) => node.type === 'wall'))
  const hasGeometry = useScene((scene) => Object.values(scene.nodes).some(
    (node) => !['site', 'building', 'level'].includes(node.type),
  ))
  const mode = useEditor((editor) => editor.mode)
  const tool = useEditor((editor) => editor.tool)
  const drawing = mode === 'build' && tool === 'wall'

  function updateBindings(next) {
    bindingRef.current = next
    setBindings(next)
  }

  async function importLayout(event) {
    const [file] = event.target.files
    event.target.value = ''
    if (!file) return
    try {
      const { scene, bindings: importedBindings } = importWeek13Layout(JSON.parse(await file.text()))
      applySceneGraphToEditor(scene)
      updateBindings(importedBindings)
      setSaveStatus('pending')
      setImportError('')
    } catch {
      setImportError('Could not import this file. Choose a valid Week 13 layout JSON.')
    }
  }

  function drawWall() {
    openEditorView('2d')
    selectWallDrawVariant('walls')
    useEditor.getState().setTool('wall')
  }

  function placeLamp() {
    openEditorView('2d')
    // Pascal's item placement tool runs in the 3D pane and accepts plan clicks.
    openEditorView('3d', { beside: true })
    placingLamp.current = getSavedSceneDocument().nodes
    activateCatalogItem(floorLamp)
  }

  function bindLamp(item) {
    updateBindings({ [item.id]: deviceId })
    setSaveStatus('pending')
  }

  function placeAt(x, z) {
    const scene = useScene.getState()
    const levelId = useViewer.getState().selection.levelId ??
      Object.values(scene.nodes).find(({ type }) => type === 'level')?.id
    if (!levelId || boundItem || !Number.isFinite(x) || !Number.isFinite(z)) return
    placingLamp.current = null
    useEditor.getState().setMode('select')
    const item = ItemNode.parse({ asset: floorLamp, name: floorLamp.name, position: [x, 0, z] })
    scene.createNode(item, levelId)
    bindLamp(item)
    selectLamp(item.id)
  }

  function acceptLampDrop(event) {
    if (loading || boundItem || !event.dataTransfer.types.includes(lampDragType)) return
    const matrix = event.target.closest('svg')?.querySelector('[data-floorplan-scene]')?.getScreenCTM()
    if (!matrix) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (event.type === 'drop') {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      placeAt(point.x, point.y)
    }
  }

  useEffect(() => {
    const previousNodes = placingLamp.current
    if (!previousNodes || (mode === 'build' && tool === 'item')) return
    placingLamp.current = null
    // A completed single placement selects its committed item before leaving build mode.
    if (mode === 'select' && selectedNode?.type === 'item' &&
        selectedNode.asset.id === floorLamp.id && !previousNodes[selectedNode.id]) {
      bindLamp(selectedNode)
    }
  }, [mode, tool, selectedNode])

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' })
    const document = response.ok ? await response.json() : null
    if (!response.ok && response.status !== 404) {
      throw new Error(`Load HTTP ${response.status}`)
    }
    setHasSaved(Boolean(document))
    updateBindings(document?.bindings ?? {})
    openEditorView('2d')
    return document?.scene ?? startingScene()
  }, [])

  const save = useCallback((scene, options) => {
    const body = JSON.stringify(layoutDocument(scene, bindingRef.current))
    const write = writes.current.catch(() => {}).then(async () => {
      const response = await fetch(endpoint, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
        keepalive: options?.keepalive && body.length < 48_000,
      })
      if (!response.ok) throw new Error(`Save HTTP ${response.status}`)
      setHasSaved(true)
    })
    writes.current = write
    return write
  }, [])

  async function saveNow() {
    setSaveStatus('saving')
    try {
      await save(getSavedSceneDocument())
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  return <main className="workspace">
    <header className="host-bar">
      <strong>Smart Home</strong>
      <div className="layout-tools" aria-label="Layout tools">
        {hasWall && <button disabled={loading} onClick={drawWall}>Draw wall</button>}
        {!hasGeometry && <>
          <button disabled={loading} onClick={() => importInput.current.click()}>Import Week 13 layout</button>
          <input ref={importInput} type="file" hidden accept=".json,application/json" onChange={importLayout} />
        </>}
      </div>
      <label>3D walls <select value={wallMode} onChange={(event) => useViewer.getState().setWallMode(event.target.value)}>
        <option value="up">Full height</option>
        <option value="cutaway">Cutaway</option>
        <option value="translucent">Translucent</option>
        <option value="down">Low</option>
      </select></label>
      <button disabled={loading || saveStatus === 'saving'} onClick={saveNow}>
        {saveStatus === 'error' ? 'Retry save' : 'Save layout'}
      </button>
      <span role="status">{saveStatus === 'saved' && !hasSaved ? 'Ready to save' : saveLabels[saveStatus]}</span>
      <div className="connection">
        <span>Live updates · {lamp.link}</span>
        <button onClick={() => lamp.setPaused(!lamp.paused)}>
          {lamp.paused ? 'Reconnect live updates' : 'Pause live updates'}
        </button>
      </div>
    </header>
    <section className="device-list" aria-label="Device list">
      <strong>Devices</strong>
      {boundItem ? <ul><li>
        <button onClick={(event) => selectLamp(boundItem.id, event)}>Floor lamp · {deviceId}</button>
        <b>{powerLabel(lamp.state)}</b>
        {lamp.state && <time dateTime={lamp.state.updatedAt}>{lamp.state.updatedAt}</time>}
      </li></ul> : <span>No linked devices</span>}
      {importError && <span role="alert">{importError}</span>}
    </section>
    <div className="pascal-stage" onDragOver={acceptLampDrop} onDrop={acceptLampDrop}>
      <LayoutToolsContext.Provider value={{ canPlace: !loading && !boundItem, placeLamp, placeAt }}>
        <Editor
          projectId={layoutId}
          layoutVersion="v2"
          actionMenuPlacement="top"
          sidebarTabs={sidebarTabs}
          columnTabId="smart-home-layout"
          onLoad={load}
          onSave={save}
          onSaveStatusChange={setSaveStatus}
          onLoaderChange={setLoading}
          inspectorFooter={bindings[selectedNode?.id] && <PowerControls item={selectedNode}
            device={bindings[selectedNode.id]} lamp={lamp} />}
          floorplanSceneSlot={boundItem && <LampPlan item={boundItem} state={lamp.state} />}
          viewerSceneSlot={boundItem && <LampScene item={boundItem} state={lamp.state} />}
        />
      </LayoutToolsContext.Provider>
      {!loading && !hasWall && !drawing && (
        <button className="empty-draw" onClick={drawWall}>Draw wall</button>
      )}
    </div>
  </main>
}
