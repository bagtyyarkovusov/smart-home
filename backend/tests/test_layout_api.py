import json
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.persistence import SqliteStore

LAYOUT_FIXTURE = (
    Path(__file__).parents[2] / "docs" / "contracts" / "week-13" / "layout.v1.json"
)


def test_saved_layout_survives_backend_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "smart-home.sqlite3"
    layout = json.loads(LAYOUT_FIXTURE.read_text(encoding="utf-8"))

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.get("/api/layouts/week-13")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "layout_not_found"

        response = client.put("/api/layouts/week-13", json=layout)
        assert response.status_code == 200
        assert response.json() == layout

    with TestClient(create_app(database_path=database_path)) as client:
        response = client.get("/api/layouts/week-13")

    assert response.status_code == 200
    assert response.json() == layout


def test_invalid_layout_does_not_replace_saved_document(tmp_path: Path) -> None:
    database_path = tmp_path / "smart-home.sqlite3"
    layout = json.loads(LAYOUT_FIXTURE.read_text(encoding="utf-8"))

    with TestClient(create_app(database_path=database_path)) as client:
        assert client.put("/api/layouts/week-13", json=layout).status_code == 200

        response = client.put(
            "/api/layouts/week-13",
            json={"version": 2, "id": "week-13", "rooms": []},
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "invalid_layout"
        assert client.get("/api/layouts/week-13").json() == layout


def test_storage_failure_returns_contract_error_and_retry_can_save(
    tmp_path: Path,
) -> None:
    layout = json.loads(LAYOUT_FIXTURE.read_text(encoding="utf-8"))

    class FailFirstSaveStore(SqliteStore):
        def __init__(self, database_path: Path) -> None:
            super().__init__(database_path)
            self.save_attempts = 0

        def save(self, layout_id: str, document: dict[str, object]) -> None:
            self.save_attempts += 1
            if self.save_attempts == 1:
                raise sqlite3.OperationalError("simulated storage failure")
            super().save(layout_id, document)

    store = FailFirstSaveStore(tmp_path / "smart-home.sqlite3")
    with TestClient(create_app(layout_store=store)) as client:
        response = client.put("/api/layouts/week-13", json=layout)
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "layout_save_failed"
        assert client.get("/api/layouts/week-13").status_code == 404

        assert client.put("/api/layouts/week-13", json=layout).status_code == 200
        assert client.get("/api/layouts/week-13").json() == layout
