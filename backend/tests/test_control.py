import asyncio
import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from app.control import CommandService
from app.device import SimulatedLamp
from app.domain import CommandPlan
from app.persistence import SqliteStore
from app.realtime import EventHub


class CountingLamp(SimulatedLamp):
    dispatches = 0

    async def apply(self, plan: CommandPlan) -> bool:
        self.dispatches += 1
        return await super().apply(plan)


@pytest.mark.parametrize(
    ("mode", "write", "release_after_deadline", "expected_status"),
    [
        ("success", "INSERT ON device_state_history", False, "succeeded"),
        (
            "success",
            "UPDATE OF status ON commands WHEN NEW.status = 'succeeded'",
            True,
            "timed_out",
        ),
        (
            "timeout",
            "UPDATE OF status ON commands WHEN NEW.status = 'timed_out'",
            True,
            "timed_out",
        ),
    ],
)
def test_terminal_write_failure_recovers_without_redispatch(
    tmp_path: Path,
    mode: str,
    write: str,
    release_after_deadline: bool,
    expected_status: str,
) -> None:
    store = SqliteStore(tmp_path / "smart-home.sqlite3")
    store.initialize()
    initial = store.get_device_state("lamp-7")
    events = EventHub()
    lamp = CountingLamp(mode=mode)
    control = CommandService(store, lamp, events, timeout_seconds=0.25)
    plan = CommandPlan("lamp-7", "retry", "power", True)

    async def run() -> None:
        queue = await events.subscribe()
        with closing(sqlite3.connect(store.database_path)) as connection:
            connection.executescript(
                f"""
                CREATE TRIGGER fail_terminal_write BEFORE {write}
                BEGIN SELECT RAISE(ABORT, 'simulated terminal write failure'); END;
                """
            )
            try:
                acceptance = control.accept(plan)
                assert acceptance.created
                await asyncio.sleep(0.3 if release_after_deadline else 0.05)
                assert store.get_device_state("lamp-7") == initial
                connection.execute("DROP TRIGGER fail_terminal_write")
                event = await asyncio.wait_for(queue.get(), timeout=1)
                assert event["type"] == f"command.{expected_status}"
                assert event["revision"] == 1
                assert control.accept(plan).command.as_dict() == event["command"]
                state = store.get_device_state("lamp-7")
                assert state is not None
                if expected_status == "succeeded":
                    assert event["state"] == state.as_dict()
                    assert state.value is True
                else:
                    assert state == initial
                    assert "state" not in event
                assert lamp.dispatches == 1
            finally:
                await control.shutdown()

        restarted = SqliteStore(store.database_path)
        restarted.initialize()
        with closing(sqlite3.connect(restarted.database_path)) as connection:
            history = connection.execute(
                "SELECT value_json, updated_at, revision FROM device_state_history"
            ).fetchall()
        if expected_status == "succeeded":
            assert history == [("true", event["state"]["updatedAt"], 1)]
        else:
            assert history == []

    asyncio.run(run())


@pytest.mark.parametrize(("capability", "value"), [("brightness", True), ("power", 1)])
def test_control_rejects_invalid_plan_before_acceptance(
    tmp_path: Path, capability: str, value: bool
) -> None:
    store = SqliteStore(tmp_path / "smart-home.sqlite3")
    store.initialize()
    lamp = CountingLamp()
    control = CommandService(store, lamp, EventHub())

    async def run() -> None:
        try:
            with pytest.raises(ValueError):
                control.accept(CommandPlan("lamp-7", "invalid", capability, value))
            assert store.get_command("invalid") is None
            assert lamp.dispatches == 0
        finally:
            await control.shutdown()

    asyncio.run(run())


def test_missing_confirmed_state_cannot_be_published_as_success(tmp_path: Path) -> None:
    store = SqliteStore(tmp_path / "smart-home.sqlite3")
    store.initialize()
    with sqlite3.connect(store.database_path) as connection:
        connection.execute("DELETE FROM device_states WHERE device_id = 'lamp-7'")
    events = EventHub()
    control = CommandService(store, CountingLamp(), events, timeout_seconds=0.05)

    async def run() -> None:
        queue = await events.subscribe()
        try:
            control.accept(CommandPlan("lamp-7", "missing-state", "power", True))
            event = await asyncio.wait_for(queue.get(), timeout=1)
            assert event["type"] == "command.timed_out"
            assert event["revision"] == 1
            assert store.get_device_state("lamp-7") is None
        finally:
            await control.shutdown()

    asyncio.run(run())
