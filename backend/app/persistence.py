import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from app.domain import (
    CommandAcceptance,
    CommandOutcome,
    CommandRecord,
    CommandStatus,
    DeviceState,
)


class SqliteStore:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.RLock()

    def initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS layouts (
                    layout_id TEXT PRIMARY KEY,
                    document TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS commands (
                    request_id TEXT PRIMARY KEY,
                    device_id TEXT NOT NULL,
                    capability TEXT NOT NULL,
                    value_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    deadline_epoch REAL NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS device_states (
                    device_id TEXT NOT NULL,
                    capability TEXT NOT NULL,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    PRIMARY KEY (device_id, capability)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS device_state_history (
                    revision INTEGER PRIMARY KEY,
                    device_id TEXT NOT NULL,
                    capability TEXT NOT NULL,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS device_capabilities (
                    device_id TEXT NOT NULL,
                    capability TEXT NOT NULL,
                    value_type TEXT NOT NULL,
                    writable INTEGER NOT NULL,
                    PRIMARY KEY (device_id, capability)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS streams (
                    stream_id TEXT PRIMARY KEY,
                    revision INTEGER NOT NULL
                )
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO device_states
                    (device_id, capability, value_json, updated_at, revision)
                VALUES ('lamp-7', 'power', 'false', '2026-11-24T08:00:00.000Z', 0)
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO device_capabilities
                    (device_id, capability, value_type, writable)
                VALUES ('lamp-7', 'power', 'boolean', 1)
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO streams (stream_id, revision)
                VALUES ('week-13', 0)
                """
            )

    def get(self, layout_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT document FROM layouts WHERE layout_id = ?",
                (layout_id,),
            ).fetchone()
        return None if row is None else json.loads(row["document"])

    def save(self, layout_id: str, document: dict[str, Any]) -> None:
        serialized = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO layouts (layout_id, document)
                VALUES (?, ?)
                ON CONFLICT(layout_id) DO UPDATE SET document = excluded.document
                """,
                (layout_id, serialized),
            )

    def get_device_state(self, device_id: str) -> DeviceState | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT device_id, capability, value_json, updated_at, revision
                FROM device_states
                WHERE device_id = ? AND capability = 'power'
                """,
                (device_id,),
            ).fetchone()
        if row is None:
            return None
        return DeviceState(
            device_id=row["device_id"],
            capability=row["capability"],
            value=bool(json.loads(row["value_json"])),
            updated_at=row["updated_at"],
            revision=row["revision"],
        )

    def has_writable_power(self, device_id: str) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT writable
                FROM device_capabilities
                WHERE device_id = ? AND capability = 'power' AND value_type = 'boolean'
                """,
                (device_id,),
            ).fetchone()
        return row is not None and bool(row["writable"])

    def get_stream_revision(self) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT revision FROM streams WHERE stream_id = ?",
                ("week-13",),
            ).fetchone()
        if row is None:
            raise RuntimeError("Week 13 stream was not initialized.")
        return int(row["revision"])

    def accept_command(
        self,
        device_id: str,
        request_id: str,
        capability: str,
        value: bool,
        deadline_epoch: float,
    ) -> CommandAcceptance:
        with self._write_lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                    SELECT request_id, device_id, capability, value_json, status
                    FROM commands
                    WHERE request_id = ?
                    """,
                (request_id,),
            ).fetchone()
            if row is not None:
                existing = self._command_from_row(row)
                if (
                    existing.device_id != device_id
                    or existing.capability != capability
                    or existing.value != value
                ):
                    raise ValueError("request_id_conflict")
                return CommandAcceptance(existing, created=False)

            connection.execute(
                """
                    INSERT INTO commands
                        (
                            request_id, device_id, capability,
                            value_json, status, deadline_epoch
                        )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                (
                    request_id,
                    device_id,
                    capability,
                    json.dumps(value),
                    CommandStatus.PENDING.value,
                    deadline_epoch,
                ),
            )
            command = CommandRecord(
                request_id=request_id,
                device_id=device_id,
                capability=capability,
                value=value,
                status=CommandStatus.PENDING,
            )
            return CommandAcceptance(
                command,
                created=True,
                deadline_epoch=deadline_epoch,
            )

    def get_command(self, request_id: str) -> CommandRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT request_id, device_id, capability, value_json, status
                FROM commands
                WHERE request_id = ?
                """,
                (request_id,),
            ).fetchone()
        return None if row is None else self._command_from_row(row)

    def commit_success(
        self,
        request_id: str,
        updated_at: str,
    ) -> CommandOutcome | None:
        with self._write_lock, self._connect(timeout=0) as connection:
            connection.execute("BEGIN IMMEDIATE")
            pending = self._get_pending_command(connection, request_id)
            if pending is None:
                return None
            command, deadline_epoch = pending
            if time.time() >= deadline_epoch:
                return None

            revision = self._next_revision(connection)
            serialized_value = json.dumps(command.value)
            connection.execute(
                """
                    UPDATE commands
                    SET status = ?
                    WHERE request_id = ? AND status = ?
                    """,
                (
                    CommandStatus.SUCCEEDED.value,
                    request_id,
                    CommandStatus.PENDING.value,
                ),
            )
            updated = connection.execute(
                """
                    UPDATE device_states
                    SET value_json = ?, updated_at = ?, revision = ?
                    WHERE device_id = ? AND capability = ?
                    """,
                (
                    serialized_value,
                    updated_at,
                    revision,
                    command.device_id,
                    command.capability,
                ),
            )
            if updated.rowcount != 1:
                raise sqlite3.IntegrityError("Confirmed state row is missing.")
            connection.execute(
                """
                INSERT INTO device_state_history
                    (device_id, capability, value_json, updated_at, revision)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    command.device_id,
                    command.capability,
                    serialized_value,
                    updated_at,
                    revision,
                ),
            )
            if time.time() >= deadline_epoch:
                connection.rollback()
                return None

            succeeded = CommandRecord(
                request_id=command.request_id,
                device_id=command.device_id,
                capability=command.capability,
                value=command.value,
                status=CommandStatus.SUCCEEDED,
            )
            state = DeviceState(
                device_id=command.device_id,
                capability=command.capability,
                value=command.value,
                updated_at=updated_at,
                revision=revision,
            )
            return CommandOutcome(
                {
                    "type": "command.succeeded",
                    "revision": revision,
                    "command": succeeded.as_dict(),
                    "state": state.as_dict(),
                }
            )

    def commit_timed_out(self, request_id: str) -> CommandOutcome | None:
        with self._write_lock, self._connect(timeout=0) as connection:
            connection.execute("BEGIN IMMEDIATE")
            pending = self._get_pending_command(connection, request_id)
            if pending is None:
                return None
            command, _ = pending

            revision = self._next_revision(connection)
            connection.execute(
                """
                    UPDATE commands
                    SET status = ?
                    WHERE request_id = ? AND status = ?
                    """,
                (
                    CommandStatus.TIMED_OUT.value,
                    request_id,
                    CommandStatus.PENDING.value,
                ),
            )
            timed_out = CommandRecord(
                request_id=command.request_id,
                device_id=command.device_id,
                capability=command.capability,
                value=command.value,
                status=CommandStatus.TIMED_OUT,
            )
            return CommandOutcome(
                {
                    "type": "command.timed_out",
                    "revision": revision,
                    "command": timed_out.as_dict(),
                }
            )

    def pending_commands(self) -> list[tuple[CommandRecord, float]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    request_id, device_id, capability,
                    value_json, status, deadline_epoch
                FROM commands
                WHERE status = ?
                ORDER BY request_id
                """,
                (CommandStatus.PENDING.value,),
            ).fetchall()
        return [
            (self._command_from_row(row), float(row["deadline_epoch"])) for row in rows
        ]

    def _get_pending_command(
        self,
        connection: sqlite3.Connection,
        request_id: str,
    ) -> tuple[CommandRecord, float] | None:
        row = connection.execute(
            """
            SELECT request_id, device_id, capability, value_json, status, deadline_epoch
            FROM commands
            WHERE request_id = ? AND status = ?
            """,
            (request_id, CommandStatus.PENDING.value),
        ).fetchone()
        if row is None:
            return None
        return self._command_from_row(row), float(row["deadline_epoch"])

    def _next_revision(self, connection: sqlite3.Connection) -> int:
        row = connection.execute(
            "SELECT revision FROM streams WHERE stream_id = ?",
            ("week-13",),
        ).fetchone()
        if row is None:
            raise RuntimeError("Week 13 stream was not initialized.")
        revision = int(row["revision"]) + 1
        connection.execute(
            "UPDATE streams SET revision = ? WHERE stream_id = ?",
            (revision, "week-13"),
        )
        return revision

    @staticmethod
    def _command_from_row(row: sqlite3.Row) -> CommandRecord:
        return CommandRecord(
            request_id=row["request_id"],
            device_id=row["device_id"],
            capability=row["capability"],
            value=bool(json.loads(row["value_json"])),
            status=CommandStatus(row["status"]),
        )

    def _connect(self, timeout: float = 5.0) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=timeout)
        connection.row_factory = sqlite3.Row
        return connection
