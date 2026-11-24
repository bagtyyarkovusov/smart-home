import math
from typing import Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    field_validator,
    model_validator,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Wall(StrictModel):
    id: str = Field(min_length=1)
    start: tuple[float, float]
    end: tuple[float, float]

    @field_validator("start", "end")
    @classmethod
    def coordinates_must_be_finite(
        cls, value: tuple[float, float]
    ) -> tuple[float, float]:
        if not all(math.isfinite(coordinate) for coordinate in value):
            raise ValueError("Coordinates must be finite.")
        return value

    @model_validator(mode="after")
    def endpoints_must_differ(self) -> Self:
        if self.start == self.end:
            raise ValueError("Wall endpoints must differ.")
        return self


class PlacedItem(StrictModel):
    id: str = Field(min_length=1)
    templateId: str = Field(min_length=1)
    deviceId: str = Field(min_length=1)
    position: tuple[float, float]
    rotationDeg: float

    @field_validator("position")
    @classmethod
    def position_must_be_finite(cls, value: tuple[float, float]) -> tuple[float, float]:
        if not all(math.isfinite(coordinate) for coordinate in value):
            raise ValueError("Position coordinates must be finite.")
        return value

    @field_validator("rotationDeg")
    @classmethod
    def rotation_must_be_finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Rotation must be finite.")
        return value


class Room(StrictModel):
    id: str = Field(min_length=1)
    walls: list[Wall]
    items: list[PlacedItem]


class LayoutDocument(StrictModel):
    version: Literal[1]
    id: Literal["week-13"]
    rooms: list[Room]

    @model_validator(mode="after")
    def one_room_with_stable_unique_objects(self) -> Self:
        if len(self.rooms) != 1:
            raise ValueError("Week 13 expects exactly one room.")

        room = self.rooms[0]
        object_ids = [wall.id for wall in room.walls] + [item.id for item in room.items]
        if len(object_ids) != len(set(object_ids)):
            raise ValueError(
                "Wall and placed item IDs must be unique within the layout."
            )

        if not room.walls:
            raise ValueError("The room must contain at least one wall.")
        if not room.items:
            raise ValueError("The room must contain at least one placed item.")
        return self


class PowerCommandRequest(StrictModel):
    requestId: str = Field(min_length=1)
    capability: Literal["power"]
    value: StrictBool
