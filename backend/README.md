# Smart Home backend

FastAPI service for the one-room, one-lamp Week 13 demo. SQLite stores the
layout, confirmed device state and its history, command outcomes, and stream revision.

## Setup

Requires Python 3.12 or newer. Run from the repository root.

PowerShell

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

POSIX shell

```sh
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
```

## Run

Run from `backend` with exactly one worker. WebSocket subscriptions and
simulator dispatch run in that worker. Use a fresh temporary directory for an
isolated demo database.

PowerShell

```powershell
$demoDir = Join-Path ([System.IO.Path]::GetTempPath()) ("smart-home-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $demoDir | Out-Null
$env:SMART_HOME_DB_PATH = Join-Path $demoDir "success.sqlite3"
$env:SMART_HOME_SIMULATOR_MODE = "success"
$env:SMART_HOME_COMMAND_TIMEOUT_SECONDS = "1.0"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

POSIX shell

```sh
demo_dir="$(mktemp -d "${TMPDIR:-/tmp}/smart-home.XXXXXX")"
export SMART_HOME_DB_PATH="$demo_dir/success.sqlite3"
export SMART_HOME_SIMULATOR_MODE=success
export SMART_HOME_COMMAND_TIMEOUT_SECONDS=1.0
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

The database is created on startup. The synthetic `lamp-7` starts at confirmed
Off with state revision 0. Save a layout, stop the server with Ctrl+C, and run
the same Uvicorn command with the same database path to verify the layout
survives restart. Use a second terminal in `backend` for the requests below.

## Contract examples

PowerShell

```powershell
curl.exe -X PUT -H "Content-Type: application/json" `
  --data-binary "@../docs/contracts/week-13/layout.v1.json" `
  http://127.0.0.1:8000/api/layouts/week-13
curl.exe http://127.0.0.1:8000/api/layouts/week-13

$scenarios = Get-Content -Raw ../docs/contracts/week-13/lamp-scenarios.json | ConvertFrom-Json
$requestFile = [System.IO.Path]::GetTempFileName()
$scenarios.success.request | ConvertTo-Json -Compress | Set-Content -Encoding ascii -Path $requestFile
curl.exe -X POST -H "Content-Type: application/json" --data-binary "@$requestFile" `
  http://127.0.0.1:8000/api/devices/lamp-7/commands
curl.exe http://127.0.0.1:8000/api/devices/lamp-7/commands/power-on-1
curl.exe http://127.0.0.1:8000/api/devices/lamp-7/state
```

POSIX shell

```sh
curl -X PUT -H 'Content-Type: application/json' \
  --data-binary @../docs/contracts/week-13/layout.v1.json \
  http://127.0.0.1:8000/api/layouts/week-13
curl http://127.0.0.1:8000/api/layouts/week-13

request_file="$(mktemp "${TMPDIR:-/tmp}/smart-home-request.XXXXXX")"
.venv/bin/python -c 'import json, sys; print(json.dumps(json.load(sys.stdin)[sys.argv[1]]["request"]))' \
  success < ../docs/contracts/week-13/lamp-scenarios.json > "$request_file"
curl -X POST -H 'Content-Type: application/json' --data-binary "@$request_file" \
  http://127.0.0.1:8000/api/devices/lamp-7/commands
curl http://127.0.0.1:8000/api/devices/lamp-7/commands/power-on-1
curl http://127.0.0.1:8000/api/devices/lamp-7/state
```

To demonstrate a timeout from Off, stop the success server. In its terminal,
set `SMART_HOME_DB_PATH` to a fresh file named `timeout.sqlite3` in the demo
directory and set `SMART_HOME_SIMULATOR_MODE=timeout`. Run the same Uvicorn
command and GET the lamp state to verify it starts Off. Use
`$scenarios.timeout.request` in the PowerShell fixture extraction or replace
`success` with `timeout` in the POSIX fixture extraction. POST that file. After
one second, look up `power-on-2` and expect `timed_out`. GET the lamp state
again and expect the same Off value, timestamp, and state revision.

Connect to `ws://127.0.0.1:8000/api/ws` before sending a command to observe
the snapshot followed by the terminal event. To test reconnect, disconnect
before the timeout, then reconnect and look up the timed-out command by ID.
Frame examples live in the [Week 13 contract](../docs/contracts/week-13/README.md).

## Trace a lamp command

Use two POSIX terminals in `backend`. Start Uvicorn in the first terminal with
INFO logging enabled for the application. The commands use port 8000. If it
is occupied, substitute the same free port in the server and both client URLs.
Run `success` first, then stop that server with Ctrl+C and repeat with
`mode=timeout` for a deterministic timeout on a separate SQLite database.

```sh
mode=success
demo_dir="$(mktemp -d "${TMPDIR:-/tmp}/smart-home-trace.XXXXXX")"
printf '%s\n' "$demo_dir"
SMART_HOME_DB_PATH="$demo_dir/$mode.sqlite3" \
SMART_HOME_SIMULATOR_MODE="$mode" \
SMART_HOME_SIMULATOR_DELAY_SECONDS=0 \
SMART_HOME_COMMAND_TIMEOUT_SECONDS=1.0 \
.venv/bin/python -c '
import logging
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(message)s")
uvicorn.run("app.main:app", host="127.0.0.1", port=8000, workers=1, access_log=False)
' > "$demo_dir/$mode.log" 2>&1
```

In the second terminal, set `demo_dir` to the printed path and match `mode`
to the running server. The client subscribes before posting the fixture, then
replays the identical POST after the terminal frame. It saves that frame for
comparison with the logs.

```sh
mode=success
demo_dir=/tmp/smart-home-trace.REPLACE_ME
.venv/bin/python - "$mode" > "$demo_dir/$mode.ws.json" <<'PY'
import json
import sys
from urllib.request import Request, urlopen

from websockets.sync.client import connect

mode = sys.argv[1]
with open("../docs/contracts/week-13/lamp-scenarios.json") as fixtures:
    body = json.dumps(json.load(fixtures)[mode]["request"]).encode()
post = Request(
    "http://127.0.0.1:8000/api/devices/lamp-7/commands",
    data=body,
    headers={"Content-Type": "application/json"},
)
with connect("ws://127.0.0.1:8000/api/ws") as ws:
    assert json.loads(ws.recv(timeout=5))["type"] == "snapshot"
    with urlopen(post, timeout=5) as accepted:
        assert accepted.status == 202
        assert json.load(accepted)["status"] == "pending"
    frame = json.loads(ws.recv(timeout=5))
    assert frame["type"] == {"success": "command.succeeded",
                             "timeout": "command.timed_out"}[mode]
    with urlopen(post, timeout=5) as replay:
        assert replay.status == 200
        assert json.load(replay) == frame["command"]
    print(json.dumps(frame))
PY
```

Stop the server in the first terminal with Ctrl+C so the log worker has time
to drain. Then compare the saved client frame with the server records.

```sh
jq -Rc --slurpfile ws "$demo_dir/$mode.ws.json" \
  'fromjson? | select(.requestId == $ws[0].command.requestId)' \
  "$demo_dir/$mode.log" | tee "$demo_dir/$mode.trace.jsonl"
jq -es --slurpfile ws "$demo_dir/$mode.ws.json" '
  map(.event) == ["command.accepted", "command.dispatched", "command.terminal",
                  "command.published", "command.replayed"]
  and (.[2:4] | all(.revision == $ws[0].revision and .status == $ws[0].command.status))
' "$demo_dir/$mode.trace.jsonl"
```

The final check prints `true` for each run. The `revision` on terminal and
publication records is the persisted **stream** revision. In a timeout, the
lamp's confirmed state keeps its previous revision. A replay returns the
stored command status, which can still be pending if retried before completion.
Use the terminal and publication records to find the command's stream revision.

The `app.commands` logger emits one JSON object per message. It includes the
caller-supplied request ID, so use an opaque ID and keep secrets out of IDs.
One background worker emits records in queue order. Under sustained sink
backpressure, the queue retains up to 1,024 records and drops new arrivals
when full. Shutdown allows up to one second for the worker to drain.
A `command.persistence_retry` warning records the first failed terminal
write in a retry sequence. `command.published` means Control handed the event
to the in-process WebSocket hub, even with no subscribers. If a subscriber
disconnects during a send, `command.websocket_send_failed` records the affected
command and revision. Delivery recovery happens through a fresh snapshot and
command lookup on reconnect.

## Manual command Strategy

The command POST route passes the validated On or Off intent to
`ManualCommandStrategy.submit_power`. This Week 13 On example uses the app's
configured Control service `commands` from the route's event loop.

```python
from app.domain import CommandIntent
from app.strategy import ManualCommandStrategy

strategy = ManualCommandStrategy(commands)
intent = CommandIntent(request_id="power-on-1", capability="power", value=True)
acceptance = strategy.submit_power("lamp-7", intent)
```

Strategy passes the following single-action plan to `Control.accept`.

```python
CommandPlan(device_id="lamp-7", request_id="power-on-1", capability="power", value=True)
```

The route receives Control's `CommandAcceptance` directly. Control dispatches
to Device, enforces the deadline, and persists confirmed state from Device
reports. A new command starts pending. Reusing the same request ID and fields
returns the stored command record, including `timed_out` if the deadline expired.

## Test

From `backend`, run `.venv/bin/python -m pytest -q` in a POSIX shell or
`.\.venv\Scripts\python.exe -m pytest -q` in PowerShell.
Run `.venv/bin/python -m pytest -q tests/test_strategy.py` for the focused fake
Control tests for On, Off, request ID preservation, and the timeout outcome.
