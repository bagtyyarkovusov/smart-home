import asyncio
import logging
import sqlite3
import time
from datetime import UTC, datetime

from app.device import SimulatedLamp
from app.domain import CommandAcceptance, CommandPlan
from app.persistence import SqliteStore
from app.realtime import EventHub

logger = logging.getLogger(__name__)


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
        self._tasks: set[asyncio.Task[None]] = set()

    def accept(self, plan: CommandPlan) -> CommandAcceptance:
        if plan.capability != "power" or type(plan.value) is not bool:
            raise InvalidCommandPlanError("Expected a Boolean power action.")
        if not self.store.has_writable_power(plan.device_id):
            raise UnknownDeviceError(plan.device_id)

        deadline_epoch = time.time() + self.timeout_seconds
        acceptance = self.store.accept_command(
            device_id=plan.device_id,
            request_id=plan.request_id,
            capability=plan.capability,
            value=plan.value,
            deadline_epoch=deadline_epoch,
        )
        if acceptance.created:
            self._track(asyncio.create_task(self._apply(plan, deadline_epoch)))
        return acceptance

    async def recover_pending(self) -> None:
        for command, deadline_epoch in self.store.pending_commands():
            self._track(
                asyncio.create_task(self._finish(command.request_id, deadline_epoch))
            )
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

    async def _apply(self, plan: CommandPlan, deadline_epoch: float) -> None:
        confirmed_at = None
        try:
            confirmed_value = await asyncio.wait_for(
                self.device.apply(plan),
                timeout=max(0.0, deadline_epoch - time.time()),
            )
        except TimeoutError:
            pass
        else:
            if confirmed_value is plan.value:
                confirmed_at = _utc_timestamp(datetime.now(UTC))

        await self._finish(plan.request_id, deadline_epoch, confirmed_at)

    async def _finish(
        self,
        request_id: str,
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
                if confirmed_at is not None and remaining > 0:
                    outcome = self.store.commit_success(request_id, confirmed_at)
                    if outcome is None and time.time() >= deadline_epoch:
                        continue
                else:
                    outcome = self.store.commit_timed_out(request_id)
            except (sqlite3.OperationalError, sqlite3.IntegrityError):
                if retry_delay == 0.01:
                    logger.warning(
                        "Command outcome write failed; retrying.", exc_info=True
                    )
                remaining = deadline_epoch - time.time()
                await asyncio.sleep(
                    min(retry_delay, remaining) if remaining > 0 else retry_delay
                )
                retry_delay = min(2 * retry_delay, 1.0)
                continue

            if outcome is not None:
                await self.events.publish(outcome.event)
            return


def _utc_timestamp(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
