import json
import logging
from collections.abc import Mapping

logger = logging.getLogger("app.commands")


def log_command(
    event: str,
    command: Mapping[str, object],
    *,
    revision: int | None = None,
    error: Exception | None = None,
) -> None:
    fields = {
        "event": event,
        "requestId": command["requestId"],
        "deviceId": command["deviceId"],
        "capability": command["capability"],
        "status": command["status"],
    }
    if revision is not None:
        fields["revision"] = revision
    if error is not None:
        fields["errorType"] = type(error).__name__
    logger.log(
        logging.WARNING if error is not None else logging.INFO,
        "%s",
        json.dumps(fields, ensure_ascii=True),
    )
