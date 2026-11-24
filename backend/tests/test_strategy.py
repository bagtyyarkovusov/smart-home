import pytest

from app.domain import (
    CommandAcceptance,
    CommandIntent,
    CommandPlan,
    CommandRecord,
    CommandStatus,
)
from app.strategy import ManualCommandStrategy


class FakeControl:
    def __init__(self, acceptance: CommandAcceptance) -> None:
        self.acceptance = acceptance
        self.plans: list[CommandPlan] = []

    def accept(self, plan: CommandPlan) -> CommandAcceptance:
        self.plans.append(plan)
        return self.acceptance


@pytest.mark.parametrize(
    ("request_id", "value"),
    [("power-on-1", True), ("power-off-1", False)],
    ids=["on", "off"],
)
def test_manual_power_submits_one_action_and_returns_acceptance(
    request_id: str, value: bool
) -> None:
    acceptance = CommandAcceptance(
        CommandRecord(request_id, "lamp-7", "power", value, CommandStatus.PENDING),
        created=True,
    )
    control = FakeControl(acceptance)
    strategy = ManualCommandStrategy(control)

    result = strategy.submit_power("lamp-7", CommandIntent(request_id, "power", value))

    assert control.plans == [CommandPlan("lamp-7", request_id, "power", value)]
    assert result is acceptance


def test_manual_power_returns_control_timeout_without_confirmed_state() -> None:
    acceptance = CommandAcceptance(
        CommandRecord("power-on-2", "lamp-7", "power", True, CommandStatus.TIMED_OUT),
        created=False,
    )
    strategy = ManualCommandStrategy(FakeControl(acceptance))

    result = strategy.submit_power("lamp-7", CommandIntent("power-on-2", "power", True))

    assert result is acceptance
    assert result.command.as_dict() == {
        "requestId": "power-on-2",
        "deviceId": "lamp-7",
        "capability": "power",
        "value": True,
        "status": "timed_out",
    }
