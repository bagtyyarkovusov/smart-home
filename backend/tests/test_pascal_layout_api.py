import json
from copy import deepcopy
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app

PASCAL_PATH = "/api/layouts/week-13/pascal"
LEGACY_PATH = "/api/layouts/week-13"
FIXTURE = Path(__file__).resolve().parents[2] / "docs/contracts/week-13/layout.v1.json"


def test_furnished_pascal_layout_survives_restart_beside_the_home3d_layout(tmp_path):
    database_path = tmp_path / "smart-home.sqlite3"
    legacy = json.loads(FIXTURE.read_text())
    document = {
        "version": 1,
        "id": "week-13",
        "scene": {
            "rootNodeIds": ["site_demo"],
            "hasExplicitPluginInstallState": False,
            "nodes": {
                "site_demo": {
                    "id": "site_demo",
                    "type": "site",
                    "children": ["building_demo"],
                },
                "building_demo": {
                    "id": "building_demo",
                    "type": "building",
                    "parentId": "site_demo",
                    "children": ["level_demo"],
                },
                "level_demo": {
                    "id": "level_demo",
                    "type": "level",
                    "parentId": "building_demo",
                    "children": [
                        "item_demo-lamp",
                        "item_stool",
                        "item_bench",
                        "item_ceramic-vase",
                        "wall_demo",
                    ],
                },
                "item_demo-lamp": {
                    "id": "item_demo-lamp",
                    "type": "item",
                    "parentId": "level_demo",
                    "asset": {"id": "floor-lamp"},
                    "position": [-2.7, 0, 0.9],
                    "rotation": [0, -0.52, 0],
                },
                "wall_demo": {
                    "id": "wall_demo",
                    "type": "wall",
                    "parentId": "level_demo",
                    "start": [0, 0],
                    "end": [2, 0],
                    "height": 2.4,
                    "thickness": 0.15,
                },
            },
        },
        "bindings": {"item_demo-lamp": "lamp-7"},
    }
    nodes = document["scene"]["nodes"]
    for name, dimensions, position, rotation in (
        ("stool", [0.48, 0.45, 0.48], [-2.05, 0, 0.9], [0, -0.78, 0]),
        ("bench", [1.2, 0.46, 0.4], [-1.1, 0, 1.7], [0, 1.57, 0]),
        ("ceramic-vase", [0.24, 0.32, 0.24], [-1.255, 0, 0.76], [0, 0.78, 0]),
    ):
        key = f"item_{name}"
        nodes[key] = {
            "id": key,
            "type": "item",
            "parentId": "level_demo",
            "asset": {
                "id": name,
                "dimensions": dimensions,
                "src": f"/models/{name}.glb",
            },
            "position": position,
            "rotation": rotation,
        }

    with TestClient(create_app(database_path)) as client:
        assert client.put(LEGACY_PATH, json=legacy).status_code == 200
        assert client.get(PASCAL_PATH).status_code == 404
        assert client.put(PASCAL_PATH, json=document).json() == document
        invalid = document | {"bindings": {"item_missing": "lamp-7"}}
        assert client.put(PASCAL_PATH, json=invalid).status_code == 422
        for key in ("item_stool", "item_bench", "item_ceramic-vase"):
            decorative = document | {"bindings": {key: "lamp-7"}}
            assert client.put(PASCAL_PATH, json=decorative).status_code == 422
        copied = deepcopy(document)
        copied_nodes = copied["scene"]["nodes"]
        copied_nodes["item_copy"] = copied_nodes["item_demo-lamp"] | {"id": "item_copy"}
        copied_nodes["level_demo"]["children"].append("item_copy")
        copied["bindings"]["item_copy"] = "lamp-7"
        assert client.put(PASCAL_PATH, json=copied).status_code == 422
        invalid_root = deepcopy(document)
        invalid_root["scene"]["rootNodeIds"] = ["item_demo-lamp"]
        assert client.put(PASCAL_PATH, json=invalid_root).status_code == 422
        invalid_hierarchy = deepcopy(document)
        invalid_hierarchy["scene"]["nodes"]["building_demo"]["children"] = []
        assert client.put(PASCAL_PATH, json=invalid_hierarchy).status_code == 422
        invalid_lamp = deepcopy(document)
        del invalid_lamp["scene"]["nodes"]["item_demo-lamp"]["position"]
        assert client.put(PASCAL_PATH, json=invalid_lamp).status_code == 422
        invalid_wall = deepcopy(document)
        invalid_wall["scene"]["nodes"]["wall_demo"]["end"] = ["2", 0]
        assert client.put(PASCAL_PATH, json=invalid_wall).status_code == 422
        orphaned_lamp = deepcopy(document)
        orphaned_lamp["scene"]["nodes"]["item_demo-lamp"]["parentId"] = "level_missing"
        rejected = client.put(PASCAL_PATH, json=orphaned_lamp)
        assert rejected.status_code == 422
        assert rejected.json()["error"]["code"] == "invalid_layout"
        assert client.get(PASCAL_PATH).json() == document
        unlisted_wall = deepcopy(document)
        unlisted_wall["scene"]["nodes"]["level_demo"]["children"].remove("wall_demo")
        assert client.put(PASCAL_PATH, json=unlisted_wall).status_code == 422
        assert client.get(PASCAL_PATH).json() == document

    with TestClient(create_app(database_path)) as client:
        assert client.get(PASCAL_PATH).json() == document
        assert client.get(LEGACY_PATH).json() == legacy
        assert client.get("/api/devices/lamp-7/state").json()["value"] is False
