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
