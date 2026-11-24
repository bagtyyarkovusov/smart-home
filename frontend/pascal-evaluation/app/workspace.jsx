import { ItemNode, loadPlugin, useScene } from '@pascal-app/core'
import { activateCatalogItem, Editor, getSavedSceneDocument, openEditorView, selectWallDrawVariant, useEditor, useFloorplanRender, useSelection } from '@pascal-app/editor'
import { builtinPlugin } from '@pascal-app/nodes'
import { configureViewer, useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useCallback, useEffect, useRef, useState } from 'react'
import { layoutDocument, layoutId, startingBindings, startingScene, stool } from './scene.mjs'
import { api, useLamp } from './use-lamp'

const tools = [
  ['wall', 'Draw wall'],
  ['room', 'Draw room'],
  ['door', 'Place door'],
]

function armTool(tool) {
  openEditorView('2d')
  if (tool === 'room' || tool === 'wall') {
    selectWallDrawVariant(tool === 'room' ? 'rectangle' : 'walls')
    useEditor.getState().setTool('wall')
    return
  }
  useEditor.getState().setTool(tool)
}

const endpoint = `${api}/api/evaluation/layout`
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
  return <Evaluation />
}

function copyLamp(item) {
  const [x, y, z] = item.position
  const copy = ItemNode.parse({
    ...item, id: undefined, children: [], position: [x + 0.65, y, z],
  })
  useScene.getState().createNode(copy, item.parentId)
  useViewer.getState().setSelection({ selectedIds: [copy.id], zoneId: null })
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
    {lamp.command?.status === 'pending' && lamp.command.deviceId && (
      <button onClick={lamp.checkCommandStatus}>Check command status</button>
    )}
    <button onClick={() => copyLamp(item)}>Copy lamp</button>
  </section>
}

function powerLabel(state) {
  if (!state) return 'Unknown'
  return state.value ? 'On' : 'Off'
}

function selectLamp(id, event) {
  event.stopPropagation()
  useViewer.getState().setSelection({ zoneId: null, selectedIds: [id] })
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
        aria-label={`Select floor lamp in 2D · ${label}`} pointerEvents={selecting ? 'auto' : 'none'}
        onClick={(event) => selectLamp(item.id, event)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            selectLamp(item.id, event)
          }
        }}>
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
        aria-label={`Select floor lamp in 3D · ${label}`}>{label}</button>
    </Html>
  </group>
}

function Evaluation() {
  const wallMode = useViewer((viewer) => viewer.wallMode)
  const lamp = useLamp()
  const [bindings, setBindings] = useState({})
  const bindingRef = useRef({})
  const writes = useRef(Promise.resolve())
  const [saveStatus, setSaveStatus] = useState('idle')
  const [hasSaved, setHasSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const { selectedNode } = useSelection()
  const boundItem = useScene((scene) => scene.nodes[Object.keys(bindings)[0]])

  const load = useCallback(async () => {
    const blank = new URLSearchParams(location.search).has('blank')
    const response = await fetch(endpoint, { cache: 'no-store' })
    const document = response.ok ? await response.json() : null
    if (!response.ok && response.status !== 404) {
      throw new Error(`Load HTTP ${response.status}`)
    }
    setHasSaved(Boolean(document))
    bindingRef.current = document?.bindings ?? (blank ? {} : startingBindings)
    setBindings(bindingRef.current)
    return document?.scene ?? startingScene({ blank })
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
        {tools.map(([tool, label]) => <button key={tool} disabled={loading} onClick={() => armTool(tool)}>{label}</button>)}
        <button disabled={loading} onClick={() => activateCatalogItem(stool)}>Place oak stool</button>
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
    <div className="pascal-stage">
      <Editor
        projectId={layoutId}
        layoutVersion="v2"
        actionMenuPlacement="top"
        onLoad={load}
        onSave={save}
        onSaveStatusChange={setSaveStatus}
        onLoaderChange={setLoading}
        inspectorFooter={bindings[selectedNode?.id] && <PowerControls item={selectedNode}
          device={bindings[selectedNode.id]} lamp={lamp} />}
        floorplanSceneSlot={boundItem && <LampPlan item={boundItem} state={lamp.state} />}
        viewerSceneSlot={boundItem && <LampScene item={boundItem} state={lamp.state} />}
      />
    </div>
  </main>
}
