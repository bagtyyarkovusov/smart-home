import asyncio
import json
import logging
from collections import deque
from collections.abc import Mapping
from contextlib import suppress
from threading import Condition, Thread

logger = logging.getLogger("app.commands")


class CommandLog:
    """Emit lifecycle records in order without running handlers on the API loop."""

    def __init__(self) -> None:
        self._ready = Condition()
        self._records: deque[tuple[int, dict[str, object]]] = deque()
        self._closed = True
        self._worker: Thread | None = None

    def start(self) -> None:
        with self._ready:
            if self._worker is not None and self._worker.is_alive():
                return
            self._closed = False
            self._worker = Thread(target=self._emit, name="command-logs", daemon=True)
            self._worker.start()

    def __call__(
        self,
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
        level = logging.WARNING if error is not None else logging.INFO
        with self._ready:
            if self._closed or len(self._records) >= 1024:
                return
            self._records.append((level, fields))
            self._ready.notify()

    def _emit(self) -> None:
        while True:
            with self._ready:
                self._ready.wait_for(lambda: self._closed or self._records)
                if not self._records:
                    return
                level, fields = self._records.popleft()
            with suppress(Exception):
                logger.log(level, "%s", json.dumps(fields, ensure_ascii=True))

    async def close(self) -> None:
        with self._ready:
            self._closed = True
            self._ready.notify()
            worker = self._worker
        if worker is not None:
            await asyncio.to_thread(worker.join, 1)
