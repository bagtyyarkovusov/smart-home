from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StrictBool,
    TypeAdapter,
    field_validator,
    model_validator,
)

GeometryNumber = Annotated[float, Field(strict=True, allow_inf_nan=False)]
pascal_point = TypeAdapter(tuple[GeometryNumber, GeometryNumber])
pascal_transform = TypeAdapter(tuple[GeometryNumber, GeometryNumber, GeometryNumber])


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Wall(StrictModel):
    id: str = Field(min_length=1)
    start: tuple[GeometryNumber, GeometryNumber]
    end: tuple[GeometryNumber, GeometryNumber]

    @model_validator(mode="after")
    def endpoints_must_differ(self) -> Self:
        if self.start == self.end:
            raise ValueError("Wall endpoints must differ.")
        return self


class PlacedItem(StrictModel):
    id: str = Field(min_length=1)
    templateId: Literal["floor-lamp"]
    deviceId: Literal["lamp-7"]
    position: tuple[GeometryNumber, GeometryNumber]
    rotationDeg: GeometryNumber


class Room(StrictModel):
    id: str = Field(min_length=1)
    walls: list[Wall] = Field(min_length=1, max_length=1)
    items: list[PlacedItem] = Field(min_length=1, max_length=1)


class LayoutDocument(StrictModel):
    version: Literal[1]
    id: Literal["week-13"]
    rooms: list[Room] = Field(min_length=1, max_length=1)

    @field_validator("version", mode="before")
    @classmethod
    def version_must_be_integer(cls, value: object) -> int:
        if type(value) is not int:
            raise ValueError("Layout version must be an integer.")
        return value

    @model_validator(mode="after")
    def object_ids_must_differ(self) -> Self:
        room = self.rooms[0]
        if room.walls[0].id == room.items[0].id:
            raise ValueError(
                "Wall and placed item IDs must be unique within the layout."
            )

        return self


class PascalScene(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    nodes: dict[str, dict[str, JsonValue]]
    rootNodeIds: list[str]
    collections: dict[str, JsonValue] | None = None
    materials: dict[str, JsonValue] | None = None
    installedPlugins: list[str] | None = None
    hasExplicitPluginInstallState: bool | None = None


class PascalLayoutDocument(StrictModel):
    version: Literal[1]
    id: Literal["week-13"]
    scene: PascalScene
    bindings: dict[str, Literal["lamp-7"]]

    @model_validator(mode="after")
    def check_scene(self) -> Self:
        nodes = self.scene.nodes
        if any(not key or key != node.get("id") for key, node in nodes.items()):
            raise ValueError("Each node key must match its ID.")
        roots = self.scene.rootNodeIds
        if (
            not roots
            or len(roots) != len(set(roots))
            or any(
                nodes.get(key, {}).get("type") != "site"
                or nodes[key].get("parentId") is not None
                for key in roots
            )
        ):
            raise ValueError("Each root must refer to an unparented site.")
        parents = set(roots)
        for parent_type, child_type in (("site", "building"), ("building", "level")):
            expected_children = {
                key for key, node in nodes.items() if node.get("type") == child_type
            }
            attached_children = set()
            for key in parents:
                children = nodes[key].get("children")
                if not isinstance(children, list) or not children:
                    raise ValueError(f"Each {parent_type} must contain a {child_type}.")
                for child in children:
                    if (
                        not isinstance(child, str)
                        or child not in nodes
                        or nodes[child].get("parentId") != key
                        or child in attached_children
                    ):
                        raise ValueError("Invalid scene hierarchy.")
                    if nodes[child].get("type") == child_type:
                        attached_children.add(child)
            if attached_children != expected_children or not expected_children:
                raise ValueError(f"Each {child_type} must belong to a {parent_type}.")
            parents = attached_children

        wall_ids = {key for key, node in nodes.items() if node.get("type") == "wall"}
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
            pascal_transform.validate_python(node.get("position"))
            pascal_transform.validate_python(node.get("rotation"))
        for key in wall_ids:
            wall = nodes[key]
            start = pascal_point.validate_python(wall.get("start"))
            end = pascal_point.validate_python(wall.get("end"))
            if start == end:
                raise ValueError("Wall endpoints must differ.")

        floor_nodes = wall_ids | self.bindings.keys()
        attached_floor_nodes = set()
        for level in parents:
            children = nodes[level].get("children")
            if not isinstance(children, list):
                continue
            for key in children:
                if not isinstance(key, str) or key not in floor_nodes:
                    continue
                if nodes[key].get("parentId") != level or key in attached_floor_nodes:
                    raise ValueError("Invalid wall or bound lamp attachment.")
                attached_floor_nodes.add(key)
        if attached_floor_nodes != floor_nodes:
            raise ValueError("Walls and bound lamps must belong to a saved level.")
        return self


class PowerCommandRequest(StrictModel):
    requestId: str = Field(min_length=1)
    capability: Literal["power"]
    value: StrictBool
