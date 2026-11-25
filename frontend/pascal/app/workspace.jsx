import { ItemNode, loadPlugin, sceneRegistry, useLiveNodeOverrides, useScene } from '@pascal-app/core'
import { activateCatalogItem, applySceneGraphToEditor, cancelActiveTool, Editor, getSavedSceneDocument, isTypingTarget, isViewVisible, openEditorView, selectWallDrawVariant, useEditor, useFloorplanRender, useSelection } from '@pascal-app/editor'
import { builtinPlugin } from '@pascal-app/nodes'
import { configureViewer, setSlotDefaultOverrides, useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { createPortal, useFrame } from '@react-three/fiber'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { filterFurniture, floorLamp, furnitureById, furnitureCategories } from './furniture-catalog.mjs'
import { deviceId, findBoundLamp, importWeek13Layout, layoutDocument, layoutId, proceduralFloorLamp, startingScene } from './scene.mjs'
import { api, useLamp } from './use-lamp'

const endpoint = `${api}/api/layouts/${layoutId}/pascal`
const furnitureDragType = 'application/x-smart-home-furniture'
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
    // Unpainted demo rooms use solid finishes so they render without texture downloads.
    setSlotDefaultOverrides({ 'library:concrete-drywall': '#efe7da', 'library:wood-woodplank48': '#ae896d' })
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

function selectPlacedItem(id, event) {
  event?.stopPropagation()
  useEditor.getState().setMode('select')
  useViewer.getState().setSelection({ zoneId: null, selectedIds: [id] })
}

function cancelDrawing() {
  const editor = useEditor.getState()
  if (editor.mode !== 'build' || editor.tool !== 'wall') return
  if (cancelActiveTool()) editor.setTool(null)
}

function clearCatalogItem(asset) {
  const editor = useEditor.getState()
  if (editor.selectedItem?.id === asset.id) editor.setSelectedItem(null)
}

function LayoutTools() {
  const {
    loading, hasPlan, boundItem, armedAsset, placementStatus, panel, setPanel,
    drawWalls, startPlacement, cancelPlacement, placeAt,
  } = useContext(LayoutToolsContext)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [templateId, setTemplateId] = useState(null)
  const searchInput = useRef(null)
  const coordinates = useRef(null)
  const results = filterFurniture(search, category)
  const template = results.find((asset) => asset.id === templateId && !(boundItem && asset.id === floorLamp.id))

  useEffect(() => {
    if (templateId && !template) setTemplateId(null)
  }, [templateId, template])

  function changeFilters(nextSearch, nextCategory) {
    if (armedAsset && !filterFurniture(nextSearch, nextCategory).includes(armedAsset)) cancelPlacement()
    setSearch(nextSearch)
    setCategory(nextCategory)
  }

  return <section className="furniture-tools" aria-label="Layout tools" onKeyDownCapture={(event) => {
    // Keep native Space activation ahead of Pascal's canvas-pan shortcut.
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) event.stopPropagation()
    if (event.key === 'Escape' && armedAsset) {
      event.preventDefault()
      event.stopPropagation()
      cancelPlacement()
    }
  }}>
    <div className="layout-tool-switch" role="group" aria-label="Layout tool panels">
      {['Draw', 'Catalog'].map((name) => <button key={name} type="button" aria-pressed={panel === name}
        onClick={() => {
          if (name === 'Draw') cancelPlacement()
          else cancelDrawing()
          setPanel(name)
        }}>{name}</button>)}
    </div>
    {panel === 'Draw' ? <div className="drawing-actions">
      <button type="button" disabled={loading} onClick={() => drawWalls('walls')}>Draw wall</button>
      <button type="button" disabled={loading} onClick={() => drawWalls('rectangle')}>Draw room</button>
    </div> : <>
      <div className="catalog-filters">
        <label>Search catalog
          <input ref={searchInput} type="search" value={search}
            onChange={(event) => changeFilters(event.target.value, category)} />
        </label>
        <label>Category
          <select value={category} onChange={(event) => changeFilters(search, event.target.value)}>
            <option value="">All categories</option>
            {furnitureCategories.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <p className="catalog-count" role="status">
        {results.length ? `${results.length} ${results.length === 1 ? 'item' : 'items'}` : 'No items match your filters'}
      </p>
      <div className="catalog-results">
        {results.length ? <div className="furniture-templates">
          {results.map((asset) => {
            const unavailable = boundItem && asset.id === floorLamp.id
            return <button key={asset.id} type="button" aria-label={asset.name} aria-pressed={template === asset}
              disabled={loading || Boolean(unavailable)} draggable={!loading && !unavailable}
              aria-description={unavailable ? 'Already in layout' : undefined}
              onDragStart={(event) => {
                cancelPlacement()
                setTemplateId(asset.id)
                event.dataTransfer.setData(furnitureDragType, asset.id)
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={(event) => {
                setTemplateId(asset.id)
                if (event.detail === 0) {
                  cancelPlacement()
                  coordinates.current.focus()
                } else startPlacement(asset)
              }}>
              <span className="catalog-thumbnail">
                <img src={asset.thumbnail} alt="" draggable={false}
                  onError={(event) => { event.currentTarget.hidden = true }} />
              </span>
              <span>{asset.name}</span>
              {unavailable && <small>Already in layout</small>}
            </button>
          })}
        </div> : <button type="button" onClick={() => {
          changeFilters('', '')
          searchInput.current.focus()
        }}>Clear filters</button>}
      </div>
      <p className="catalog-placement-status" role="status">
        {armedAsset ? `Click the plan to place ${armedAsset.name}. Esc to cancel.` :
          placementStatus || 'Click a tile, then the plan. Or drag a tile onto the plan.'}
      </p>
      {!hasPlan && <button type="button" onClick={() => openEditorView('2d')}>Open 2D plan</button>}
      <form className="catalog-coordinates" onSubmit={(event) => {
        event.preventDefault()
        const fields = event.currentTarget.elements
        if (template) placeAt(template, fields.x.valueAsNumber / 100, fields.z.valueAsNumber / 100)
      }}>
        <p>{template ? `Coordinates · ${template.name}` : 'Choose an item to place at coordinates.'}</p>
        <label>X (cm)<input ref={coordinates} name="x" type="number" step="any" defaultValue="0" required /></label>
        <label>Z (cm)<input name="z" type="number" step="any" defaultValue="0" required /></label>
        <button disabled={loading || !template}>Place at coordinates</button>
      </form>
    </>}
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
        onClick={(event) => selectPlacedItem(item.id, event)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            selectPlacedItem(item.id, event)
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
  const [anchor, setAnchor] = useState(null)
  const selecting = useEditor((editor) => editor.mode === 'select' || editor.mode === 'edit')
  const liveScale = useLiveNodeOverrides((overrides) => overrides.get(item.id)?.scale)
  useFrame(() => {
    const renderedItem = sceneRegistry.nodes.get(item.id) ?? null
    if (renderedItem !== anchor) setAnchor(renderedItem)
  })
  if (!anchor) return null
  const label = powerLabel(state)
  const height = item.asset.dimensions[1] * (liveScale ?? item.scale)[1]
  // Pascal's rendered group already follows the building, level, and live item transform.
  return createPortal(<>
    {state?.value && <pointLight position={[0, height * 0.88, 0]} color="#ffc28a" intensity={32} distance={3.2} />}
    <Html position={[0, height + 0.28, 0]} center style={{ pointerEvents: selecting ? 'auto' : 'none' }}>
      <button className="scene-power" data-on={Boolean(state?.value)} disabled={!selecting}
        onClick={(event) => selectPlacedItem(item.id, event)}
        aria-label={`Select floor lamp in 3D · ${label}`} title={powerDescription(state)}
        aria-description={powerDescription(state)}>{label}</button>
    </Html>
  </>, anchor)
}

function DemoEditor() {
  const wallMode = useViewer((viewer) => viewer.wallMode)
  const lamp = useLamp()
  // Keep deleted bindings in memory so Pascal's undo can restore the same ID.
  const [bindings, setBindings] = useState({})
  const bindingRef = useRef({})
  const writes = useRef(Promise.resolve())
  const [saveStatus, setSaveStatus] = useState('idle')
  const [hasSaved, setHasSaved] = useState(false)
  const [importError, setImportError] = useState('')
  const importInput = useRef(null)
  const placement = useRef(null)
  const [placementStatus, setPlacementStatus] = useState('')
  const [panel, setPanel] = useState('Draw')
  const [loading, setLoading] = useState(true)
  const { selectedNode } = useSelection()
  const boundItem = useScene((scene) => findBoundLamp(scene.nodes, bindings))
  const boundItemId = boundItem?.id
  const boundAssetSrc = boundItem?.asset.src
  const hasRoom = useScene((scene) => Object.values(scene.nodes).some((node) => node.type === 'zone'))
  const hasGeometry = useScene((scene) => Object.values(scene.nodes).some(
    (node) => !['site', 'building', 'level'].includes(node.type),
  ))
  const mode = useEditor((editor) => editor.mode)
  const tool = useEditor((editor) => editor.tool)
  const activeItem = useEditor((editor) => editor.selectedItem)
  const hasPlan = useEditor((editor) => isViewVisible(editor, '2d'))
  const placingItem = mode === 'build' && tool === 'item'
  const armedAsset = placingItem && activeItem?.id === placement.current?.asset.id ? placement.current?.asset : null
  const drawing = mode === 'build' && tool === 'wall'

  function updateBindings(next) {
    bindingRef.current = next
    setBindings(next)
  }

  useEffect(() => {
    function openCatalog(event) {
      if (event.key !== 'f' || event.metaKey || event.ctrlKey || event.altKey ||
          event.defaultPrevented || isTypingTarget(event.target)) return
      event.preventDefault()
      cancelDrawing()
      useEditor.getState().setActiveSidebarPanel(sidebarTabs[0].id)
      setPanel('Catalog')
    }
    window.addEventListener('keydown', openCatalog, true)
    return () => window.removeEventListener('keydown', openCatalog, true)
  }, [])

  useEffect(() => {
    if (boundAssetSrc !== floorLamp.src) return
    let stopKeepingFallback
    function keepFallback(overrides) {
      if (overrides.get(boundItemId)?.asset !== proceduralFloorLamp) {
        overrides.set(boundItemId, { asset: proceduralFloorLamp })
      }
    }
    function onLoadFailure(viewer) {
      if (stopKeepingFallback || !viewer.itemLoadFailures[boundItemId]) return
      // Pascal clears the live overrides when a gesture commits. Restore only our asset field.
      stopKeepingFallback = useLiveNodeOverrides.subscribe(keepFallback)
      keepFallback(useLiveNodeOverrides.getState())
    }
    const stopWatching = useViewer.subscribe(onLoadFailure)
    onLoadFailure(useViewer.getState())
    return () => {
      stopWatching()
      stopKeepingFallback?.()
      const overrides = useLiveNodeOverrides.getState()
      if (overrides.get(boundItemId)?.asset === proceduralFloorLamp) {
        overrides.clearFields(boundItemId, ['asset'])
      }
    }
  }, [boundItemId, boundAssetSrc])

  useEffect(() => useEditor.subscribe((editor) => {
    if (placement.current && editor.mode === 'build' && editor.tool === 'item' &&
        editor.selectedItem?.id === placement.current.asset.id && editor.continuationByContext.point !== 'once') {
      editor.setContinuation('point', 'once')
    }
  }), [])

  async function importLayout(event) {
    const [file] = event.target.files
    event.target.value = ''
    if (!file) return
    try {
      const { scene, bindings: importedBindings } = importWeek13Layout(JSON.parse(await file.text()))
      cancelPlacement()
      applySceneGraphToEditor(scene)
      updateBindings(importedBindings)
      setSaveStatus('pending')
      setImportError('')
    } catch {
      setImportError('Could not import this file. Choose a valid Week 13 layout JSON.')
    }
  }

  function drawWalls(variant) {
    cancelPlacement()
    cancelDrawing()
    setPanel('Draw')
    openEditorView('2d')
    selectWallDrawVariant(variant)
    useEditor.getState().setTool('wall')
  }

  function canPlace(asset) {
    return !loading && (asset.id !== floorLamp.id ||
      !findBoundLamp(useScene.getState().nodes, bindingRef.current))
  }

  function cancelPlacement() {
    if (!placement.current) return
    const { asset } = placement.current
    placement.current = null
    const editor = useEditor.getState()
    if (editor.mode === 'build' && editor.tool === 'item' && editor.selectedItem?.id === asset.id) {
      cancelActiveTool()
    }
    clearCatalogItem(asset)
    setPlacementStatus('Placement canceled.')
  }

  function startPlacement(asset) {
    cancelPlacement()
    if (!canPlace(asset)) return
    openEditorView('2d')
    // Pascal's item placement tool runs in the 3D pane and accepts plan clicks.
    openEditorView('3d', { beside: true })
    placement.current = { asset, previousNodes: useScene.getState().nodes }
    useEditor.getState().setContinuation('point', 'once')
    setPlacementStatus('')
    activateCatalogItem(asset)
  }

  function bindLamp(item) {
    updateBindings({ ...bindingRef.current, [item.id]: deviceId })
    setSaveStatus('pending')
  }

  function placeAt(asset, x, z) {
    const scene = useScene.getState()
    const levelId = useViewer.getState().selection.levelId ??
      Object.values(scene.nodes).find(({ type }) => type === 'level')?.id
    if (!levelId || !canPlace(asset) || !Number.isFinite(x) || !Number.isFinite(z)) return
    cancelPlacement()
    useEditor.getState().setMode('select')
    const item = ItemNode.parse({ asset, name: asset.name, position: [x, 0, z] })
    scene.createNode(item, levelId)
    if (asset.id === floorLamp.id) bindLamp(item)
    selectPlacedItem(item.id)
    setPlacementStatus(`${asset.name} placed.`)
  }

  function acceptFurnitureDrop(event) {
    if (loading || !event.dataTransfer.types.includes(furnitureDragType)) return
    const matrix = event.target.closest('svg')?.querySelector('[data-floorplan-scene]')?.getScreenCTM()
    if (!matrix) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (event.type === 'drop') {
      const asset = furnitureById(event.dataTransfer.getData(furnitureDragType))
      if (!asset) return
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      placeAt(asset, point.x, point.y)
    }
  }

  useEffect(() => {
    const intent = placement.current
    if (!intent) return
    if (placingItem && activeItem?.id === intent.asset.id) {
      if (!hasPlan || (intent.asset.id === floorLamp.id && boundItem)) cancelPlacement()
      return
    }
    placement.current = null
    clearCatalogItem(intent.asset)
    // Pascal selects the committed node before exiting its once-only tool.
    if (mode === 'select' && selectedNode?.type === 'item' &&
        selectedNode.asset.id === intent.asset.id && !intent.previousNodes[selectedNode.id]) {
      if (intent.asset.id === floorLamp.id) bindLamp(selectedNode)
      setPlacementStatus(`${intent.asset.name} placed.`)
    } else {
      setPlacementStatus('Placement canceled.')
    }
  }, [placingItem, activeItem, hasPlan, boundItem, mode, selectedNode])

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
      {!hasGeometry && <>
        <button disabled={loading} onClick={() => importInput.current.click()}>Import Week 13 layout</button>
        <input ref={importInput} type="file" hidden accept=".json,application/json" onChange={importLayout} />
      </>}
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
        <button onClick={(event) => selectPlacedItem(boundItem.id, event)}>Floor lamp · {deviceId}</button>
        <b>{powerLabel(lamp.state)}</b>
        {lamp.state && <time dateTime={lamp.state.updatedAt}>{lamp.state.updatedAt}</time>}
      </li></ul> : <span>No linked devices</span>}
      {importError && <span role="alert">{importError}</span>}
    </section>
    <div className="pascal-stage" data-place-lamp-on-plan={armedAsset?.id === floorLamp.id || undefined}
      onDragOver={acceptFurnitureDrop} onDrop={acceptFurnitureDrop}>
      <LayoutToolsContext.Provider value={{ loading, hasPlan, boundItem, armedAsset, placementStatus, panel, setPanel, drawWalls, startPlacement, cancelPlacement, placeAt }}>
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
          inspectorFooter={boundItem && selectedNode?.id === boundItem.id && <PowerControls item={boundItem}
            device={bindings[boundItem.id]} lamp={lamp} />}
          floorplanSceneSlot={boundItem && <LampPlan item={boundItem} state={lamp.state} />}
          viewerSceneSlot={<>
            {hasRoom && <>
              {/* Fill the cutaway from its open side while Pascal supplies daylight shadows. */}
              <hemisphereLight args={['#fff3df', '#c7ad8e', 1.75]} />
              <directionalLight position={[3, 6, 4]} color="#fff5e6" intensity={1.1} />
            </>}
            {boundItem && <LampScene key={boundItem.id} item={boundItem} state={lamp.state} />}
          </>}
        />
      </LayoutToolsContext.Provider>
      {!loading && hasPlan && !hasGeometry && !drawing && !placingItem && (
        <button className="empty-draw" onClick={() => drawWalls('walls')}>Draw wall</button>
      )}
    </div>
  </main>
}
