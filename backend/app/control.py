import asyncio
import time
from datetime import UTC, datetime

from app.device import SimulatedLamp
from app.domain import CommandAcceptance, CommandPlan
from app.persistence import SqliteStore
from app.realtime import EventHub


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
            task = asyncio.create_task(self._apply(plan, deadline_epoch))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
        return acceptance

    async def recover_pending(self) -> None:
        now = time.time()
        for command, deadline_epoch in self.store.pending_commands():
            if deadline_epoch <= now:
                outcome = self.store.commit_timed_out(command.request_id)
                if outcome is not None:
                    await self.events.publish(outcome.event)
                continue

            task = asyncio.create_task(
                self._expire_without_redispatch(command.request_id, deadline_epoch)
            )
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)

    async def shutdown(self) -> None:
        tasks = tuple(self._tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _apply(self, plan: CommandPlan, deadline_epoch: float) -> None:
        try:
            confirmed_value = await asyncio.wait_for(
                self.device.apply(plan),
                timeout=max(0.0, deadline_epoch - time.time()),
            )
        except TimeoutError:
            outcome = self.store.commit_timed_out(plan.request_id)
        else:
            if confirmed_value != plan.value:
                outcome = self.store.commit_timed_out(plan.request_id)
            else:
                outcome = self.store.commit_success(
                    plan.request_id,
                    _utc_timestamp(datetime.now(UTC)),
                )

        if outcome is not None:
            await self.events.publish(outcome.event)

    async def _expire_without_redispatch(
        self,
        request_id: str,
        deadline_epoch: float,
    ) -> None:
        delay = max(0.0, deadline_epoch - time.time())
        await asyncio.sleep(delay)
        outcome = self.store.commit_timed_out(request_id)
        if outcome is not None:
            await self.events.publish(outcome.event)


def _utc_timestamp(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
