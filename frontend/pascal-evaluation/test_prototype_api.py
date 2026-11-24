from fastapi.testclient import TestClient


def test_layout_survives_app_restart_and_binding_requires_an_item(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("SMART_HOME_DB_PATH", str(tmp_path / "evaluation.sqlite3"))
    from prototype_api import create_evaluation_app

    path = "/api/evaluation/layout"
    document = {
        "version": 1,
        "id": "pascal-evaluation",
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

    with TestClient(create_evaluation_app()) as client:
        assert client.get(path).status_code == 404
        assert client.put(path, json=document).status_code == 200
        invalid = document | {"bindings": {"item_missing": "lamp-7"}}
        assert client.put(path, json=invalid).status_code == 422
        copied = document | {
            "bindings": {"item_demo-lamp": "lamp-7", "item_x": "lamp-7"}
        }
        assert client.put(path, json=copied).status_code == 422

    with TestClient(create_evaluation_app()) as client:
        assert client.get(path).json() == document
        assert client.get("/api/layouts/week-13").status_code == 404
        assert client.get("/api/devices/lamp-7/state").json()["value"] is False
