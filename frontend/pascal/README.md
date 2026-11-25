# Smart Home Week 13 demo

Pascal is the supported editor for the [room-and-lamp demo](https://github.com/bagtyyarkovusov/smart-home/issues/11). The demo uses one room, one wall and the simulated floor lamp `lamp-7`. The team still needs instructor approval for the editor change before presenting it. [ADR 0001](../../docs/adr/0001-pascal-week-13-demo.md) records the decision and Home3D fallback.

## Start from a clean checkout

Verified on macOS arm64 with Node 24.13.0, npm 11.6.2, Python 3.12.13, uv
0.11.9, and desktop Google Chrome 158.0.8127.88. The lockfile pins Next.js
16.4.6, React 19.3.1, Three 0.187.0, React Three Fiber 9.8.2, and Pascal
core, viewer, editor and nodes 1.1.6. The backend uses FastAPI 0.165.0 and
Uvicorn 0.54.0.

Start FastAPI in terminal one from the repository root.

```sh
demo_dir="$(mktemp -d /tmp/smart-home-week13.XXXXXX)"
uv venv --python 3.12 "$demo_dir/venv"
uv pip install --python "$demo_dir/venv/bin/python" -r backend/pyproject.toml --extra dev
cd backend
export SMART_HOME_DB_PATH="$demo_dir/success.sqlite3"
export SMART_HOME_SIMULATOR_MODE=success
export SMART_HOME_SIMULATOR_DELAY_SECONDS=1.5
export SMART_HOME_COMMAND_TIMEOUT_SECONDS=3
"$demo_dir/venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8160 --workers 1
```

The optional simulator delay gives the presenter time to point out pending
command feedback. Build and start Pascal in terminal two from the repository root.

```sh
cd frontend/pascal
npm ci
NEXT_TELEMETRY_DISABLED=1 npm run build
NEXT_TELEMETRY_DISABLED=1 npm start
```

Open [the workspace](http://127.0.0.1:3160/) in Chrome. Use the exact loopback
host above for the backend's CORS origin.

## Draw, save and reopen

1. Choose **Draw wall**, click two endpoints, then press Esc.
2. In **Layout tools**, click **Add floor lamp**, then click on the plan.
   You can also drag **Add floor lamp** onto the plan or enter coordinates
   with the keyboard and activate **Place at coordinates**. Each path binds
   the placed lamp to `lamp-7`. Select it from the device list or either badge.
   Expand the inspector if it is collapsed. Set **Position** in centimetres
   and **Rotation** in degrees.
3. Select **Save layout** and wait for **Saved**. Stop Uvicorn with Ctrl+C and
   run the same command with the same database. Reload Chrome. Compare
   `GET http://127.0.0.1:8160/api/layouts/week-13/pascal` before and after
   restart to inspect the stable graph IDs, ordered wall endpoints, lamp
   transform and binding.
4. Choose **2D** and **Split**, then choose **3D** in the second pane. In 3D,
   select the lamp with its status badge. Use **3D walls** to adjust visibility.

### Furnish one room

1. In a fresh workspace, choose **Draw room** in **Layout tools** and click
   opposite corners of a rectangle in the plan. Press Esc.
2. In **Layout tools**, add two lounge chairs, a coffee table, a rug, a potted
   plant, and the floor lamp. The catalog supports
   plan clicks, drag-and-drop, and **Place at coordinates**. For keyboard
   placement, activate an **Add** button to focus X, enter X and Z in
   centimetres, and submit the form. The room can have one linked floor lamp.
3. Select each placed item in 2D and edit X and Z under **Position**. Rotate
   it under **Rotation**. In **Split**, use **Cutaway** under **3D walls** and
   orbit the 3D camera to show the seating and lamp alongside their plan footprints.
4. Save and restart FastAPI with the same SQLite file as above. Compare the
   Pascal GET bodies, including the room polygon and wall endpoints, each
   item's ID, `asset.id`, `position`, and `rotation`, and the one
   `lamp-7` binding. Reload in Chrome and select the lamp's 3D badge to
   request **On**. Check both badges, the device list, and the inspector.
5. For local asset proof, block requests outside the two loopback origins
   (for example, allow those origins in a Playwright Chrome context route
   and abort the rest). Reload, select **Demo room** if the plan opens at
   site level, and open 3D. Check that the lounge chair, coffee table, rug,
   potted plant, and linen floor lamp GLBs load from `/models/` and render.
   Compare Off and On from the same 3D camera position.

For the demo composition, draw from `(-250, -200)` to `(250, 200)` in plan
centimetres. Add the items in this order. Set Y rotation in the inspector.

| Item | X (cm) | Y (cm) | Z (cm) | Y rotation |
| --- | ---: | ---: | ---: | ---: |
| Rug | 0 | 0 | 45 | 0° |
| Lounge chair | −92 | 0 | −52 | −45° |
| Lounge chair | 88 | 0 | −56 | 45° |
| Coffee table | 4 | 0 | 66 | 45° |
| Potted plant | 30 | 40 | 47 | 0° |
| Floor lamp | −178 | 0 | −126 | 45° |

The imported Week 13 fixture and previous saves retain the original lamp
appearance. Newly placed lamps use the locally bundled Kenney model. Pascal's
model failure report switches the linked lamp to the original procedural GLB
for that browser session if its new model is unavailable. The saved layout
retains its selected model. The light follows the rendered lamp and the
server-confirmed power state.

### Import the existing fixture

Open a blank workspace using a fresh SQLite file. Select **Import Week 13 layout**
and choose [`layout.v1.json`](../../docs/contracts/week-13/layout.v1.json).
Save and reopen as above. The import groups the room under Pascal's level and
keeps the room, wall and item IDs in each node's `metadata.week13Id`. The
document ID, asset ID and device ID preserve the fixture values directly.
The [Week 13 contract](../../docs/contracts/week-13/README.md) documents the
axes and the separate legacy endpoint.

### Confirm power and recover a timeout

In the success run, select the lamp, then choose **On** under **Smart Home
power**. Pending leaves the last confirmed value on screen. After confirmation,
compare the 2D badge, 3D badge, device list and inspector. Hover either badge
   to inspect its confirmed timestamp. Both badges also expose it as their
   accessible description.

Stop Uvicorn and copy the saved layout into a fresh timeout database using
the Pascal layout API. With the success server running, save its GET response
to a file first:

```sh
curl -fsS http://127.0.0.1:8160/api/layouts/week-13/pascal -o /tmp/week13-pascal-layout.json
```

Then stop the server, set `SMART_HOME_DB_PATH="$demo_dir/timeout.sqlite3"` and
`SMART_HOME_SIMULATOR_MODE=timeout`, and start the same Uvicorn command. Upload
only the layout to the fresh database:

```sh
curl -fsS -X PUT -H 'Content-Type: application/json' \
  --data-binary @/tmp/week13-pascal-layout.json \
  http://127.0.0.1:8160/api/layouts/week-13/pascal
```

Reload Chrome. The fresh simulator starts at confirmed Off. Choose **On** with
live updates connected and watch **Command timed out** while all four surfaces
stay Off. Then choose **Pause live updates**, request **On** again, wait past
the deadline and choose **Reconnect live updates**. The snapshot restores
confirmed Off and the request ID lookup recovers the timeout. **Check command
status** retries a lookup when recovery fails.

## Checks and attribution

Run `npm test` from this directory and the [backend checks](../../backend/README.md#test)
from `backend`.

The workspace comes from [Pascal evaluation PR #17](https://github.com/bagtyyarkovusov/smart-home/pull/17)
and uses the [official embedded editor](https://www.npmjs.com/package/@pascal-app/editor/v/1.1.6)
with the [Next.js host reference](https://github.com/pascalorg/editor/tree/1580a95098016b725f50daea87b2a8bc372046e9/apps/editor).
The postinstall script fixes the published editor's workspace-only TypeScript
configuration and converts the pinned item inspector's position inputs to
centimetres. Pascal's scene still stores metres. The optional
`@emnapi/wasi-threads` pin keeps npm's clean install aligned with its optional WASM tree.

The bundled Pascal UI icons and cursor are from `apps/editor/public` at the pinned
Next.js host reference above. They retain the [upstream MIT notice](public/icons/LICENSE-PASCAL.txt).
Next serves them directly from `/icons` with image optimization disabled.

The models and their textures use [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Attribution is optional, and the table records each creator and source. The
third-party GLBs contain standard geometry and embedded JPEGs, with no remote
dependencies. The chair, table, and plant textures have the same authors and
[license](https://polyhaven.com/license) as their respective geometry.

| Bundled GLB | Source | Width × height × depth (cm) |
| --- | --- | --- |
| [`linen-floor-lamp.glb`](public/models/linen-floor-lamp.glb) | [Lamp Round Floor](https://poly.pizza/m/8LiDIfXVLi) by Kenney, [source GLB](https://static.poly.pizza/98dd45a1-0682-4d44-83d1-32fa2a4fca5b.glb) | 40 × 120 × 20 |
| [`lounge-chair.glb`](public/models/lounge-chair.glb) | [Mid Century Lounge Chair](https://polyhaven.com/a/mid_century_lounge_chair) by Kuutti Siitonen, [model and textures](https://api.polyhaven.com/files/mid_century_lounge_chair) | 100 × 117 × 119 |
| [`coffee-table.glb`](public/models/coffee-table.glb) | [Modern Coffee Table 01](https://polyhaven.com/a/modern_coffee_table_01) by Amin, [model and textures](https://api.polyhaven.com/files/modern_coffee_table_01) | 120 × 39 × 60 |
| [`potted-plant.glb`](public/models/potted-plant.glb) | [Potted Plant 04](https://polyhaven.com/a/potted_plant_04) by James Ray Cock, [model and textures](https://api.polyhaven.com/files/potted_plant_04) | 17 × 27 × 19 |
| [`floor-lamp.glb`](public/models/floor-lamp.glb) | Smart Home's procedural lamp | 40 × 120 × 20 (with template scale) |
| [`rug.glb`](public/models/rug.glb), [`stool.glb`](public/models/stool.glb), [`bench.glb`](public/models/bench.glb) | Smart Home's original procedural geometry | 260 × 1.6 × 180 / 48 × 45 × 48 / 120 × 46 × 40 |

To rebuild on macOS, download the `gltf["1k"].gltf` URL as `source.gltf`
and its `include` files at their declared relative paths in a directory named
for each Poly Haven asset. Put those directories and the Kenney GLB (as
`kenney-lamp.glb`) under the same source directory. From `frontend/pascal`,
run `node scripts/pack-room-models.mjs <source-directory>` after `npm ci`.
The script resizes the supplied color, normal, and roughness or packed maps
to a maximum of 512 pixels, embeds them, centers and grounds each mesh in
metres, turns the table's long edge toward X, and recolors the lamp's original
materials to brass and warm fabric. Regenerate the procedural assets with
`python3 scripts/make-models.py`.

Instrument Sans retains the OFL notice.
