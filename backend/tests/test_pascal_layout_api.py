import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app

PASCAL_PATH = "/api/layouts/week-13/pascal"
LEGACY_PATH = "/api/layouts/week-13"
FIXTURE = Path(__file__).resolve().parents[2] / "docs/contracts/week-13/layout.v1.json"


def test_pascal_layout_survives_restart_beside_the_home3d_layout(tmp_path):
    database_path = tmp_path / "smart-home.sqlite3"
    legacy = json.loads(FIXTURE.read_text())
    document = {
        "version": 1,
        "id": "week-13",
        "scene": {
            "rootNodeIds": ["level_demo"],
            "hasExplicitPluginInstallState": False,
            "nodes": {
                "level_demo": {"id": "level_demo", "type": "level"},
                "item_demo-lamp": {
                    "id": "item_demo-lamp",
                    "type": "item",
                    "asset": {"id": "floor-lamp"},
                    "position": [-2.7, 0, 0.9],
                    "rotation": [0, -0.52, 0],
                },
            },
        },
        "bindings": {"item_demo-lamp": "lamp-7"},
    }
    nodes = document["scene"]["nodes"]
    nodes["item_x"] = nodes["item_demo-lamp"] | {
        "id": "item_x",
        "position": [-2.05, 0, 0.9],
    }

    with TestClient(create_app(database_path)) as client:
        assert client.put(LEGACY_PATH, json=legacy).status_code == 200
        assert client.get(PASCAL_PATH).status_code == 404
        assert client.put(PASCAL_PATH, json=document).json() == document
        invalid = document | {"bindings": {"item_missing": "lamp-7"}}
        assert client.put(PASCAL_PATH, json=invalid).status_code == 422
        copied = document | {
            "bindings": {"item_demo-lamp": "lamp-7", "item_x": "lamp-7"}
        }
        assert client.put(PASCAL_PATH, json=copied).status_code == 422

    with TestClient(create_app(database_path)) as client:
        assert client.get(PASCAL_PATH).json() == document
        assert client.get(LEGACY_PATH).json() == legacy
        assert client.get("/api/devices/lamp-7/state").json()["value"] is False
