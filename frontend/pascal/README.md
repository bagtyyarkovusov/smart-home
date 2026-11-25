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

1. Close the Pascal Plugins panel if it is open. Choose **Draw wall**, click
   two endpoints, then press Esc.
2. Choose **Add floor lamp**. When the placement preview appears in split
   view, click on the plan to place the lamp and bind it to `lamp-7`. Select
   it from the device list or either badge. Expand the inspector if it is
   collapsed. Use **Position** and **Rotation** to set the lamp's transform.
3. Select **Save layout** and wait for **Saved**. Stop Uvicorn with Ctrl+C and
   run the same command with the same database. Reload Chrome. Compare
   `GET http://127.0.0.1:8160/api/layouts/week-13/pascal` before and after
   restart to inspect the stable graph IDs, ordered wall endpoints, lamp
   transform and binding.
4. Choose **2D** and **Split**, then choose **3D** in the second pane. In 3D,
   select the lamp with its status badge. Use **3D walls** to adjust visibility.

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
configuration. The optional `@emnapi/wasi-threads` pin keeps npm's clean install
aligned with its optional WASM tree.

The bundled Pascal UI icons and cursor are from `apps/editor/public` at the pinned
Next.js host reference above. They retain the [upstream MIT notice](public/icons/LICENSE-PASCAL.txt).
Next serves them directly from `/icons` with image optimization disabled.

The bundled procedural lamp and stool GLBs are original geometry generated by
[`scripts/make-models.py`](scripts/make-models.py) and dedicated under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Instrument Sans
retains the OFL notice.
