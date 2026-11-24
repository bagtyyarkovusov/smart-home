# Smart Home backend

FastAPI service for the one-room, one-lamp Week 13 demo. SQLite stores the
saved layout, confirmed device state, command outcomes, and stream revision.

## Setup

Requires Python 3.12 or newer.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

## Run

Choose an isolated database file and start one process:

```powershell
$env:SMART_HOME_DB_PATH = Join-Path (Get-Location) "data\demo.sqlite3"
$env:SMART_HOME_SIMULATOR_MODE = "success"
$env:SMART_HOME_COMMAND_TIMEOUT_SECONDS = "1.0"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The database is created on startup. The synthetic `lamp-7` device starts with
confirmed power Off and state revision 0. No layout exists until one is saved.
To demonstrate a timeout, restart the backend with
`SMART_HOME_SIMULATOR_MODE=timeout`.

## Contract examples

Save the committed Week 13 fixture:

```powershell
curl.exe -X PUT `
  -H "Content-Type: application/json" `
  --data-binary "@../docs/contracts/week-13/layout.v1.json" `
  http://127.0.0.1:8000/api/layouts/week-13
```

Commands and state:

```powershell
curl.exe http://127.0.0.1:8000/api/devices/lamp-7/state
curl.exe -X POST `
  -H "Content-Type: application/json" `
  -d "{\"requestId\":\"power-on-1\",\"capability\":\"power\",\"value\":true}" `
  http://127.0.0.1:8000/api/devices/lamp-7/commands
curl.exe http://127.0.0.1:8000/api/devices/lamp-7/commands/power-on-1
```

The WebSocket endpoint is `/api/ws`. Its first frame is a snapshot containing
the confirmed state and current stream revision; later frames follow the
contract in [`docs/contracts/week-13/README.md`](../docs/contracts/week-13/README.md).

## Test

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

The suite covers layout save/reload and restart, validation and storage failure,
confirmed-state snapshots, successful power control, deterministic timeout,
idempotency and request conflicts, and pending-command recovery after restart.
