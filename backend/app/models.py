from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    field_validator,
    model_validator,
)

GeometryNumber = Annotated[float, Field(strict=True, allow_inf_nan=False)]


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


class PowerCommandRequest(StrictModel):
    requestId: str = Field(min_length=1)
    capability: Literal["power"]
    value: StrictBool
