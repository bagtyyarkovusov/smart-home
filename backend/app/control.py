import asyncio
import sqlite3
import time
from datetime import UTC, datetime

from app.command_logging import CommandLog
from app.device import SimulatedLamp
from app.domain import CommandAcceptance, CommandPlan, CommandRecord
from app.persistence import SqliteStore
from app.realtime import EventHub


class InvalidCommandPlanError(ValueError):
    pass


class UnknownDeviceError(Exception):
    pass


class CommandService:
    def __init__(
        self,
        store: SqliteStore,
        device: SimulatedLamp,
        events: EventHub,
        timeout_seconds: float = 1.0,
    ) -> None:
        self.store = store
        self.device = device
        self.events = events
        self.timeout_seconds = timeout_seconds
        self.command_log = CommandLog()
        self._tasks: set[asyncio.Task[None]] = set()
        self._confirmation_writes = asyncio.Lock()

    def accept(self, plan: CommandPlan) -> CommandAcceptance:
        if plan.capability != "power" or type(plan.value) is not bool:
            raise InvalidCommandPlanError("Expected a Boolean power action.")
        if not self.store.has_writable_power(plan.device_id):
            existing = self.store.get_command(plan.request_id)
            if existing is not None and existing.device_id != plan.device_id:
                raise ValueError("request_id_conflict")
            raise UnknownDeviceError(plan.device_id)

        deadline_epoch = time.time() + self.timeout_seconds
        acceptance = self.store.accept_command(
            device_id=plan.device_id,
            request_id=plan.request_id,
            capability=plan.capability,
            value=plan.value,
            deadline_epoch=deadline_epoch,
        )
        self.command_log(
            "command.accepted" if acceptance.created else "command.replayed",
            acceptance.command.as_dict(),
        )
        if acceptance.created:
            self._track(
                asyncio.create_task(
                    self._apply(plan, acceptance.command, deadline_epoch)
                )
            )
        return acceptance

    async def recover_pending(self) -> None:
        self.command_log.start()
        for command, deadline_epoch in self.store.pending_commands():
            self._track(asyncio.create_task(self._finish(command, deadline_epoch)))
        # Give expired commands one write attempt before startup completes.
        await asyncio.sleep(0)

    def _track(self, task: asyncio.Task[None]) -> None:
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def shutdown(self) -> None:
        tasks = tuple(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.command_log.close()

    async def _dispatch(self, plan: CommandPlan, command: CommandRecord) -> bool:
        self.command_log("command.dispatched", command.as_dict())
        return await self.device.apply(plan)

    async def _apply(
        self, plan: CommandPlan, command: CommandRecord, deadline_epoch: float
    ) -> None:
        confirmed_at = None
        try:
            confirmed_value = await asyncio.wait_for(
                self._dispatch(plan, command),
                timeout=max(0.0, deadline_epoch - time.time()),
            )
        except TimeoutError:
            pass
        else:
            received_at = datetime.now(UTC)
            if (
                confirmed_value is plan.value
                and received_at.timestamp() < deadline_epoch
            ):
                confirmed_at = _utc_timestamp(received_at)

        if confirmed_at is None:
            await self._finish(command, deadline_epoch)
            return

        # Write and publish confirmations for the simulated lamp in arrival order.
        async with self._confirmation_writes:
            await self._finish(command, deadline_epoch, confirmed_at)

    async def _finish(
        self,
        command: CommandRecord,
        deadline_epoch: float,
        confirmed_at: str | None = None,
    ) -> None:
        retry_delay = 0.01
        while True:
            remaining = deadline_epoch - time.time()
            if confirmed_at is None and remaining > 0:
                await asyncio.sleep(remaining)
                continue

            try:
                if confirmed_at is not None:
                    outcome = self.store.commit_success(
                        command.request_id, confirmed_at
                    )
                else:
                    outcome = self.store.commit_timed_out(command.request_id)
            except (sqlite3.OperationalError, sqlite3.IntegrityError) as error:
                if retry_delay == 0.01:
                    self.command_log(
                        "command.persistence_retry",
                        command.as_dict(),
                        error=error,
                    )
                await asyncio.sleep(retry_delay)
                retry_delay = min(2 * retry_delay, 1.0)
                continue

            if outcome is not None:
                event = outcome.event
                self.command_log(
                    "command.terminal", event["command"], revision=event["revision"]
                )
                await self.events.publish(event)
                self.command_log(
                    "command.published", event["command"], revision=event["revision"]
                )
            return


def _utc_timestamp(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
