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
export SMART_HOME_DB_PATH="$scratch/drawing.sqlite3"
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

In desktop Chrome, choose **2D** and **Split**, then choose **3D** in the second pane. Close the
Pascal Plugins panel if it is open. Set **3D walls** to **Cutaway** to see the furnishings. Use a new
database for each walkthrough. Both URL variants reopen a layout if the database already has one.

### Draw and edit from blank

With the fresh `drawing.sqlite3` database, open `http://127.0.0.1:3160/?blank`. Choose **Draw room**
and click two opposite corners. Use **Draw wall** to draw a partition between the midpoints of two
opposite walls. Pascal splits the outline and detects two rooms. Choose **Place door** and click the
partition. Press Esc, select the door, and edit its width. Verify both panes reflect the opening.

### Furnish, save, and confirm power

1. Stop Uvicorn. Export `SMART_HOME_DB_PATH="$scratch/success.sqlite3"` and restart Uvicorn with
   success mode. Open `http://127.0.0.1:3160/` to get the seeded living room, study, and bound lamp.
2. Choose **Place oak stool**, move the pointer into the study, and click to place it. Select the lamp
   footprint or status badge in 2D, then try its status badge in 3D. Expand the inspector to reach
   **Smart Home power**. Use **Copy lamp** in the footer. The new item can move and has no power controls.
3. Change the shared door's width from 0.90 m to 1.20 m. Choose **Save layout** and wait for **Saved**.
   Restart Uvicorn with the same database path, reload Chrome, and inspect the geometry. Compare
   `GET /api/evaluation/layout` before and after restart to check IDs, assets, transforms, shared wall,
   door, and binding.
4. Select the original lamp and press **On**. The plan, 3D marker, and inspector show confirmed On
   after the WebSocket event. The inspector shows the server timestamp and command outcome.

### Recover a missed timeout

Stop Uvicorn, export `SMART_HOME_DB_PATH="$scratch/timeout.sqlite3"` and
`SMART_HOME_SIMULATOR_MODE=timeout`, and start it again. Reload the seeded layout at `/`. Select the
lamp, pause live updates, press **On**, wait past the deadline, then reconnect. The snapshot restores
Off and the command lookup recovers the timeout. If lookup fails, use **Check command status** in the
inspector to look up the same request again.

## Integration and constraints

- Pascal owns editing, tool interactions, picking, geometry and rendering. The host uses the public
  editor, selection, tool and scene-slot interfaces. The extra plan and scene markers point into
  Pascal selection. Pascal's inspector footer hosts the device controls, and Pascal controls inspector
  expansion. Direct clicks on the 3D lamp mesh were unreliable in split view, so use the in-scene
  badge there. The native lamp Duplicate carry interaction did not retain a copy in the tested
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

Keep Home3D for the course baseline. Pascal's supported Next.js host ran and demonstrated shared
walls, hosted openings, linked 2D/3D editing, and Smart Home controls in one workspace. The main
migration costs are moving the existing layouts to a new graph contract, improving 3D picking, and
maintaining the package and asset setup. Those costs are worth revisiting if the team decides that
Pascal's multi-room tools offer a faster route to the final furnished-house demo.
