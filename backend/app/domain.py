from dataclasses import dataclass
from enum import StrEnum
from typing import Any


@dataclass(frozen=True)
class DeviceState:
    device_id: str
    capability: str
    value: bool
    updated_at: str
    revision: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "deviceId": self.device_id,
            "capability": self.capability,
            "value": self.value,
            "updatedAt": self.updated_at,
            "revision": self.revision,
        }


class CommandStatus(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    TIMED_OUT = "timed_out"
    REJECTED = "rejected"


@dataclass(frozen=True)
class CommandIntent:
    request_id: str
    capability: str
    value: bool


@dataclass(frozen=True)
class CommandPlan:
    device_id: str
    request_id: str
    capability: str
    value: bool


@dataclass(frozen=True)
class CommandRecord:
    request_id: str
    device_id: str
    capability: str
    value: bool
    status: CommandStatus

    def as_dict(self) -> dict[str, Any]:
        return {
            "requestId": self.request_id,
            "deviceId": self.device_id,
            "capability": self.capability,
            "value": self.value,
            "status": self.status.value,
        }


@dataclass(frozen=True)
class CommandAcceptance:
    command: CommandRecord
    created: bool
    deadline_epoch: float | None = None


@dataclass(frozen=True)
class CommandOutcome:
    event: dict[str, Any]
