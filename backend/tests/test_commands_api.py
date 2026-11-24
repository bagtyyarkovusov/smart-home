import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.persistence import SqliteStore

INITIAL_STATE = {
    "deviceId": "lamp-7",
    "capability": "power",
    "value": False,
    "updatedAt": "2026-11-24T08:00:00.000Z",
    "revision": 0,
}


def test_websocket_snapshot_reports_confirmed_off_state(tmp_path: Path) -> None:
    with TestClient(
        create_app(database_path=tmp_path / "smart-home.sqlite3")
    ) as client:
        response = client.get("/api/devices/lamp-7/state")
        assert response.status_code == 200
        assert response.json() == INITIAL_STATE

        with client.websocket_connect("/api/ws") as websocket:
            assert websocket.receive_json() == {
                "type": "snapshot",
                "revision": 0,
                "state": INITIAL_STATE,
            }


def test_power_on_command_succeeds_and_publishes_confirmed_state(
    tmp_path: Path,
) -> None:
    request = {"requestId": "power-on-1", "capability": "power", "value": True}
    with TestClient(
        create_app(
            database_path=tmp_path / "smart-home.sqlite3",
            simulator_mode="success",
        )
    ) as client:
        with client.websocket_connect("/api/ws") as websocket:
            assert websocket.receive_json()["type"] == "snapshot"

            response = client.post("/api/devices/lamp-7/commands", json=request)
            assert response.status_code == 202
            assert response.json() == {
                "requestId": "power-on-1",
                "deviceId": "lamp-7",
                "capability": "power",
                "value": True,
                "status": "pending",
            }

            event = websocket.receive_json()

        assert event["type"] == "command.succeeded"
        assert event["revision"] == 1
        assert event["command"] == {
            "requestId": "power-on-1",
            "deviceId": "lamp-7",
            "capability": "power",
            "value": True,
            "status": "succeeded",
        }
        assert event["state"]["deviceId"] == "lamp-7"
        assert event["state"]["capability"] == "power"
        assert event["state"]["value"] is True
        assert event["state"]["revision"] == 1

        assert client.get("/api/devices/lamp-7/state").json() == event["state"]
        assert (
            client.get("/api/devices/lamp-7/commands/power-on-1").json()
            == event["command"]
        )


def test_timed_out_command_keeps_last_confirmed_state(tmp_path: Path) -> None:
    request = {"requestId": "power-on-2", "capability": "power", "value": True}
    with TestClient(
        create_app(
            database_path=tmp_path / "smart-home.sqlite3",
            simulator_mode="timeout",
            command_timeout_seconds=0.05,
        )
    ) as client:
        with client.websocket_connect("/api/ws") as websocket:
            assert websocket.receive_json()["type"] == "snapshot"

            response = client.post("/api/devices/lamp-7/commands", json=request)
            assert response.status_code == 202
            event = websocket.receive_json()

        assert event == {
            "type": "command.timed_out",
            "revision": 1,
            "command": {
                "requestId": "power-on-2",
                "deviceId": "lamp-7",
                "capability": "power",
                "value": True,
                "status": "timed_out",
            },
        }
        assert client.get("/api/devices/lamp-7/state").json() == INITIAL_STATE
        assert (
            client.get("/api/devices/lamp-7/commands/power-on-2").json()
            == event["command"]
        )

        with client.websocket_connect("/api/ws") as websocket:
            assert websocket.receive_json() == {
                "type": "snapshot",
                "revision": 1,
                "state": INITIAL_STATE,
            }


def test_repeated_request_returns_existing_command_without_second_dispatch(
    tmp_path: Path,
) -> None:
    request = {"requestId": "power-on-repeat", "capability": "power", "value": True}
    with TestClient(
        create_app(
            database_path=tmp_path / "smart-home.sqlite3",
            simulator_mode="success",
        )
    ) as client:
        with client.websocket_connect("/api/ws") as websocket:
            websocket.receive_json()
            assert (
                client.post("/api/devices/lamp-7/commands", json=request).status_code
                == 202
            )
            event = websocket.receive_json()

        repeated = client.post("/api/devices/lamp-7/commands", json=request)
        assert repeated.status_code == 200
        assert repeated.json() == event["command"]
        assert client.get("/api/devices/lamp-7/state").json()["revision"] == 1

        conflict = client.post(
            "/api/devices/lamp-7/commands",
            json={**request, "value": False},
        )
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "request_id_conflict"

        different_target = client.post("/api/devices/other-lamp/commands", json=request)
        assert different_target.status_code == 409
        assert different_target.json()["error"]["code"] == "request_id_conflict"


def test_invalid_and_unknown_command_inputs_have_contract_errors(
    tmp_path: Path,
) -> None:
    with TestClient(
        create_app(database_path=tmp_path / "smart-home.sqlite3")
    ) as client:
        invalid = client.post(
            "/api/devices/lamp-7/commands",
            json={"requestId": "invalid-1", "capability": "power", "value": "true"},
        )
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "invalid_command"

        missing_device = client.post(
            "/api/devices/missing/commands",
            json={"requestId": "missing-1", "capability": "power", "value": True},
        )
        assert missing_device.status_code == 404
        assert missing_device.json()["error"]["code"] == "device_not_found"

        missing_command = client.get("/api/devices/lamp-7/commands/not-found")
        assert missing_command.status_code == 404
        assert missing_command.json()["error"]["code"] == "command_not_found"


@pytest.mark.parametrize(
    ("request_id", "lookup_suffix"),
    [("on/1", "/on%2F1"), ("on\n1", "/on%0A1"), (".", "%2F."), ("..", "%2F..")],
)
def test_command_lookup_recovers_encoded_request_ids(
    tmp_path: Path, request_id: str, lookup_suffix: str
) -> None:
    route = "/api/devices/lamp-7/commands"
    with TestClient(
        create_app(database_path=tmp_path / "smart-home.sqlite3")
    ) as client:
        accepted = client.post(
            route, json={"requestId": request_id, "capability": "power", "value": True}
        )
        assert accepted.status_code == 202
        found = client.get(f"{route}{lookup_suffix}")
        assert found.status_code == 200
        assert found.json()["requestId"] == request_id


def test_confirmed_command_outcome_survives_backend_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "smart-home.sqlite3"
    request = {"requestId": "power-on-restart", "capability": "power", "value": True}

    with (
        TestClient(create_app(database_path=database_path)) as client,
        client.websocket_connect("/api/ws") as websocket,
    ):
        assert websocket.receive_json()["type"] == "snapshot"
        assert (
            client.post("/api/devices/lamp-7/commands", json=request).status_code == 202
        )
        while True:
            frame = websocket.receive_json()
            if frame["type"] == "command.succeeded":
                break

    with TestClient(create_app(database_path=database_path)) as client:
        state = client.get("/api/devices/lamp-7/state").json()
        command = client.get("/api/devices/lamp-7/commands/power-on-restart").json()
        with client.websocket_connect("/api/ws") as websocket:
            snapshot = websocket.receive_json()

    assert state["value"] is True
    assert state["revision"] == 1
    assert command["status"] == "succeeded"
    assert snapshot["revision"] == 1
    assert snapshot["state"] == state


def test_expired_pending_command_recovers_as_timeout_without_redispatch(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "smart-home.sqlite3"
    store = SqliteStore(database_path)
    store.initialize()
    store.accept_command(
        device_id="lamp-7",
        request_id="pending-before-restart",
        capability="power",
        value=True,
        deadline_epoch=time.time() - 1,
    )

    with TestClient(create_app(layout_store=store)) as client:
        command = client.get(
            "/api/devices/lamp-7/commands/pending-before-restart"
        ).json()
        state = client.get("/api/devices/lamp-7/state").json()
        with client.websocket_connect("/api/ws") as websocket:
            snapshot = websocket.receive_json()

    assert command["status"] == "timed_out"
    assert state == INITIAL_STATE
    assert snapshot == {"type": "snapshot", "revision": 1, "state": INITIAL_STATE}
