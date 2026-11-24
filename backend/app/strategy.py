from typing import Protocol

from app.domain import CommandAcceptance, CommandIntent, CommandPlan


class Control(Protocol):
    def accept(self, plan: CommandPlan) -> CommandAcceptance: ...


class ManualCommandStrategy:
    def __init__(self, control: Control) -> None:
        self._control = control

    def submit_power(self, device_id: str, intent: CommandIntent) -> CommandAcceptance:
        plan = CommandPlan(
            device_id=device_id,
            request_id=intent.request_id,
            capability=intent.capability,
            value=intent.value,
        )
        return self._control.accept(plan)
