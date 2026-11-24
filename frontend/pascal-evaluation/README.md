# Pascal evaluation for Smart Home

Disposable, single-household prototype for [issue #16](https://github.com/bagtyyarkovusov/smart-home/issues/16).
It evaluates whether Pascal can host Smart Home controls and a furnished multi-room layout.
The approved Home3D demo and [issue #11](https://github.com/bagtyyarkovusov/smart-home/issues/11) have their own entry points.

## Run locally

Verified toolchain on macOS arm64: Node 24.13.0, npm 11.6.2, Python 3.12.13, desktop Google Chrome 158.0.8127.88.
The lockfile pins Next.js 16.4.6, React 19.3.1, Three 0.187.0, React Three Fiber 9.8.2, and
Pascal core, viewer, editor and nodes 1.1.6 (registry `gitHead` `b5519cca2808170e0c3d27eaf726acad6181cf29`).
Follow the [official embedded editor](https://www.npmjs.com/package/@pascal-app/editor/v/1.1.6)
and [Next.js host reference](https://github.com/pascalorg/editor/tree/1580a95098016b725f50daea87b2a8bc372046e9/apps/editor).

From the repo root, run the backend in terminal one.

```sh
scratch="$(mktemp -d /tmp/smart-home-pascal.XXXXXX)"
uv venv --python 3.12 "$scratch/venv"
uv pip install --python "$scratch/venv/bin/python" -r backend/pyproject.toml --extra dev
cd frontend/pascal-evaluation
export PYTHONPATH=../../backend
export SMART_HOME_DB_PATH="$scratch/success.sqlite3"
export SMART_HOME_SIMULATOR_MODE=success
export SMART_HOME_COMMAND_TIMEOUT_SECONDS=1
"$scratch/venv/bin/python" -m uvicorn prototype_api:create_evaluation_app \
  --factory --host 127.0.0.1 --port 8160 --workers 1
```

From the repo root, run the workspace in terminal two.

```sh
cd frontend/pascal-evaluation
npm ci
NEXT_TELEMETRY_DISABLED=1 npm run build
NEXT_TELEMETRY_DISABLED=1 npm start
```

Open `http://127.0.0.1:3160` in desktop Chrome. Choose **2D** and **Split**, then choose **3D** in the second
pane. Close the Pascal Plugins panel if it is open. Set **3D walls** to **Cutaway** to see the furnishings.
The first unsaved layout includes the living room, study, shared wall, hosted door, and bound floor lamp.
With a fresh database, `/?blank` opens an empty level for drawing. Both URLs reopen the saved layout once
the database contains one.

1. On a blank level, choose **Draw room**, then click two opposite corners. Use **Draw wall**
   to draw a partition between the midpoints of two opposite walls. Pascal splits the outline and
   detects the two rooms. Choose **Place door** and click the partition. Press Esc, select the door,
   and edit its width in the inspector. The split view uses one scene, so edits propagate between panes.
2. Choose **Place oak stool**, move the pointer into the study, and click to commit. Choose the lamp
   footprint or its status badge. Expand the inspector to reach **Smart Home power**. Try the same
   selection from the 3D view. Use **Copy lamp** in the Smart Home footer and inspect the
   newly selected copy. The native inspector still supports moving it.
3. **Save layout** and wait for **Saved**. Stop Uvicorn and repeat its start command with the same
   database path. Reload Chrome and inspect the geometry. Compare `GET /api/evaluation/layout` before
   and after restart to check the layout ID, node IDs, assets, transforms, shared wall, door, and binding.
4. In a fresh success database, select the bound lamp and press **On**. The plan, 3D marker and inspector
   update from the WebSocket confirmed state. The inspector shows the server timestamp and command outcome.
5. Stop Uvicorn, export `SMART_HOME_DB_PATH="$scratch/timeout.sqlite3"` and
   `SMART_HOME_SIMULATOR_MODE=timeout`, and start it again. Reload the browser to start from Off. Select
   the lamp, pause live updates, press **On** and wait past the one-second deadline. Reconnect live
   updates. The snapshot retains Off and the client looks up the accepted request to display the timeout.

## Integration and constraints

- Pascal owns editing, tool interactions, picking, geometry and rendering. The host uses the public
  editor, selection, tool and scene-slot interfaces. The extra plan and scene markers point into
  Pascal selection. Pascal's inspector footer hosts the device controls, and Pascal controls inspector
  expansion. The native lamp Duplicate carry interaction did not retain a copy in the tested
  split-view flows. **Copy lamp** commits a new item through Pascal's public scene store,
  with the same template and rotation and a 65 cm offset. The host uses Instrument Sans, Smart Home colors and focus indicators on its controls.
- The prototype adapter wraps the existing FastAPI factory and SQLite store. Its new layout endpoint
  stores a versioned envelope containing a Pascal scene and a binding map keyed by placed-item ID.
  Walls shared by two room zones occur once in the graph, and the door belongs to that wall. Transforms
  use Pascal metres and radians. The graph and asset IDs are preserved as supplied. A new item from
  Pascal's duplicate tool carries its asset template but has no matching device entry. Geometry is
  saved independently of command outcomes and confirmed power. The adapter validates the envelope and
  identities, and relies on the pinned editor for detailed graph geometry. It is scoped to a local,
  trusted single user and the one simulated lamp.
- The browser uses the existing command POST, WebSocket snapshot and events, and command lookup by
  request ID. A command's pending or timeout result never changes the confirmed lamp revision. On
  reconnect, the browser applies the snapshot and looks up an outstanding accepted command without
  replaying the intent. The pause button is a local proof control.
- The published editor ships an unresolved workspace-only TypeScript config. The postinstall script
  removes that extension and supplies the JSX setting expected by Next. There are no Pascal runtime
  source edits. Next's transpilation and Tailwind source configuration are required. The optional
  `@emnapi/wasi-threads` pin keeps npm 11.6.2's clean install aligned with its optional WASM tree.
- The stool and lamp GLBs are original geometry generated by `scripts/make-models.py`, dedicated
  under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). They have no external files
  or textures. Bundled Pascal editor UI icons came from the pinned host reference above and retain
  its MIT notice. Instrument Sans is redistributed from this repo under its existing OFL notice.
  Third-party furniture from Pascal's hosted catalog is outside this prototype's asset inventory.
- This is a loopback-only evaluation. External upstream icon and sound requests may still come
  from unused Pascal UI features. No catalog upload, device provisioning, multi-user write policy,
  or Home3D interchange is implemented. Replacing Home3D would also require course approval and
  a separate architectural decision.

## Checks and recommendation

```sh
# From frontend/pascal-evaluation with the environment from terminal one
npm test
"$scratch/venv/bin/python" -m pytest -q test_prototype_api.py
"$scratch/venv/bin/ruff" check --config ../../backend/pyproject.toml \
  prototype_api.py test_prototype_api.py scripts/make-models.py
```

Keep Home3D for the course baseline. Pascal offers shared-wall topology, hosted openings, and linked
2D/3D editing without writing a renderer. Adopting it would add a Next.js app and its asset setup,
continued management of a published-package workaround, a new graph contract, and separate host
integration for selection, persistence and confirmed-state controls. The evaluation establishes a
basis for revisiting the renderer after the approved Week 13 demo and before any migration decision.
