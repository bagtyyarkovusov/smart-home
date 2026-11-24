"""Disposable FastAPI entry point for the Pascal evaluation."""

import os
from pathlib import Path
from typing import Literal, Self

from app.persistence import SqliteStore
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, JsonValue, model_validator

LAYOUT_ID = "pascal-evaluation"


class PascalScene(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    nodes: dict[str, dict[str, JsonValue]]
    rootNodeIds: list[str]
    collections: dict[str, JsonValue] | None = None
    materials: dict[str, JsonValue] | None = None
    installedPlugins: list[str] | None = None
    hasExplicitPluginInstallState: bool | None = None


class Layout(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    id: Literal["pascal-evaluation"]
    scene: PascalScene
    bindings: dict[str, Literal["lamp-7"]]

    @model_validator(mode="after")
    def check_identities(self) -> Self:
        nodes = self.scene.nodes
        if any(not key or key != node.get("id") for key, node in nodes.items()):
            raise ValueError("Each node key must match its ID.")
        if not self.scene.rootNodeIds or any(
            key not in nodes for key in self.scene.rootNodeIds
        ):
            raise ValueError("Each root must refer to a saved node.")
        if len(self.bindings) > 1:
            raise ValueError("Only one placed item can control lamp-7.")
        for key in self.bindings:
            node = nodes.get(key, {})
            asset = node.get("asset")
            if (
                node.get("type") != "item"
                or not isinstance(asset, dict)
                or asset.get("id") != "floor-lamp"
            ):
                raise ValueError("A binding must refer to a placed floor lamp.")
        return self


def create_evaluation_app() -> FastAPI:
    database_path = Path(os.environ["SMART_HOME_DB_PATH"])
    # Importing app.main creates its default app. Require the scratch path first.
    from app.main import create_app

    store = SqliteStore(database_path)
    application = create_app(layout_store=store)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:3160"],
        allow_methods=["GET", "PUT", "POST"],
        allow_headers=["Content-Type"],
    )
    path = "/api/evaluation/layout"

    @application.get(path)
    def load_layout() -> dict[str, JsonValue]:
        document = store.get(LAYOUT_ID)
        if document is None:
            raise HTTPException(404, "No evaluation layout saved.")
        return document

    @application.put(path)
    def save_layout(layout: Layout) -> dict[str, JsonValue]:
        document = layout.model_dump(mode="json", exclude_unset=True)
        store.save(LAYOUT_ID, document)
        return document

    return application
