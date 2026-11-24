import asyncio

from app.domain import CommandPlan


class SimulatedLamp:
    def __init__(self, mode: str = "success", delay_seconds: float = 0.0) -> None:
        if mode not in {"success", "timeout"}:
            raise ValueError("simulator mode must be 'success' or 'timeout'")
        self.mode = mode
        self.delay_seconds = delay_seconds

    async def apply(self, plan: CommandPlan) -> bool:
        if self.mode == "timeout":
            await asyncio.Event().wait()
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        return plan.value
