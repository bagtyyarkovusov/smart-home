from app.domain import CommandIntent, CommandPlan


class ManualCommandStrategy:
    def plan_power(self, device_id: str, intent: CommandIntent) -> CommandPlan:
        return CommandPlan(
            device_id=device_id,
            request_id=intent.request_id,
            capability=intent.capability,
            value=intent.value,
        )
