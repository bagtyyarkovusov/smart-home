import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from anyio import CancelScope, create_task_group
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.convertors import PathConvertor, register_url_convertor
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.control import CommandService, UnknownDeviceError
from app.device import SimulatedLamp
from app.domain import CommandIntent
from app.models import LayoutDocument, PascalLayoutDocument, PowerCommandRequest
from app.persistence import SqliteStore
from app.realtime import EventHub
from app.strategy import ManualCommandStrategy

LAYOUT_ID = "week-13"
PASCAL_LAYOUT_KEY = "week-13/pascal"


class RequestIdConvertor(PathConvertor):
    # ASGI decodes escaped slashes and newlines before route matching.
    regex = r"(?s:.+)"


register_url_convertor("request_id", RequestIdConvertor())


def create_app(
    database_path: Path | str | None = None,
    layout_store: SqliteStore | None = None,
    simulator_mode: str | None = None,
    command_timeout_seconds: float | None = None,
) -> FastAPI:
    resolved_database_path = Path(
        database_path
        or os.environ.get(
            "SMART_HOME_DB_PATH",
            Path(__file__).parent.parent / "data" / "smart-home.sqlite3",
        )
    )
    store = layout_store or SqliteStore(resolved_database_path)
    store.initialize()
    events = EventHub()
    resolved_timeout = command_timeout_seconds
    if resolved_timeout is None:
        resolved_timeout = float(
            os.environ.get("SMART_HOME_COMMAND_TIMEOUT_SECONDS", "1.0")
        )
    device = SimulatedLamp(
        mode=simulator_mode or os.environ.get("SMART_HOME_SIMULATOR_MODE", "success"),
        delay_seconds=float(os.environ.get("SMART_HOME_SIMULATOR_DELAY_SECONDS", "0")),
    )
    commands = CommandService(
        store=store,
        device=device,
        events=events,
        timeout_seconds=resolved_timeout,
    )
    strategy = ManualCommandStrategy(commands)

    @asynccontextmanager
    async def lifespan(_application: FastAPI):
        await commands.recover_pending()
        try:
            yield
        finally:
            await commands.shutdown()

    application = FastAPI(title="Smart Home API", lifespan=lifespan)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:3160"],
        allow_methods=["GET", "PUT", "POST"],
        allow_headers=["Content-Type"],
    )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(request, _error):
        is_command = "/devices/" in request.url.path
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "invalid_command" if is_command else "invalid_layout",
                    "message": (
                        "Expected a valid power command."
                        if is_command
                        else "Expected a valid Week 13 layout."
                    ),
                }
            },
        )

    def load_layout(key: str) -> dict[str, object] | JSONResponse:
        layout = store.get(key)
        if layout is None:
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "code": "layout_not_found",
                        "message": "No layout has been saved.",
                    }
                },
            )
        # The stricter PUT schema still lets users retrieve previously saved data.
        return layout

    def save_layout(key: str, document: dict[str, object]) -> JSONResponse | None:
        try:
            store.save(key, document)
        except sqlite3.Error:
            return JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "code": "layout_save_failed",
                        "message": "Could not save the layout. Try again.",
                    }
                },
            )
        return None

    @application.get(f"/api/layouts/{LAYOUT_ID}", response_model=None)
    def get_layout() -> dict[str, object] | JSONResponse:
        return load_layout(LAYOUT_ID)

    @application.put(f"/api/layouts/{LAYOUT_ID}", response_model=LayoutDocument)
    def put_layout(document: LayoutDocument) -> LayoutDocument | JSONResponse:
        return save_layout(LAYOUT_ID, document.model_dump(mode="json")) or document

    @application.get(f"/api/layouts/{PASCAL_LAYOUT_KEY}", response_model=None)
    def get_pascal_layout() -> dict[str, object] | JSONResponse:
        return load_layout(PASCAL_LAYOUT_KEY)

    @application.put(f"/api/layouts/{PASCAL_LAYOUT_KEY}", response_model=None)
    def put_pascal_layout(
        layout: PascalLayoutDocument,
    ) -> dict[str, object] | JSONResponse:
        document = layout.model_dump(mode="json", exclude_unset=True)
        return save_layout(PASCAL_LAYOUT_KEY, document) or document

    @application.get("/api/devices/{device_id}/state", response_model=None)
    def get_lamp_state(device_id: str) -> dict[str, object] | JSONResponse:
        state = store.get_device_state(device_id)
        if state is None:
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "code": "device_not_found",
                        "message": "The requested device does not exist.",
                    }
                },
            )
        return state.as_dict()

    @application.post("/api/devices/{device_id}/commands", response_model=None)
    async def post_command(
        device_id: str,
        command_request: PowerCommandRequest,
    ) -> dict[str, object] | JSONResponse:
        intent = CommandIntent(
            request_id=command_request.requestId,
            capability=command_request.capability,
            value=command_request.value,
        )
        try:
            acceptance = strategy.submit_power(device_id, intent)
        except UnknownDeviceError:
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "code": "device_not_found",
                        "message": "The requested device does not exist.",
                    }
                },
            )
        except ValueError:
            return JSONResponse(
                status_code=409,
                content={
                    "error": {
                        "code": "request_id_conflict",
                        "message": "The request ID is already used by another command.",
                    }
                },
            )
        return JSONResponse(
            status_code=202 if acceptance.created else 200,
            content=acceptance.command.as_dict(),
        )

    @application.get("/api/devices/{device_id}/commands/{request_id:request_id}")
    def get_command(device_id: str, request_id: str) -> JSONResponse:
        command = store.get_command(request_id)
        if command is None or command.device_id != device_id:
            return JSONResponse(
                status_code=404,
                content={
                    "error": {
                        "code": "command_not_found",
                        "message": "The requested command does not exist.",
                    }
                },
            )
        return JSONResponse(status_code=200, content=command.as_dict())

    @application.websocket("/api/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        await websocket.accept()
        queue = await events.subscribe()

        async def send_events(cancel_scope: CancelScope) -> None:
            try:
                while True:
                    await websocket.send_json(await queue.get())
            except WebSocketDisconnect:
                cancel_scope.cancel()

        try:
            state = store.get_device_state("lamp-7")
            if state is None:
                await websocket.close(code=1011)
                return

            await websocket.send_json(
                {
                    "type": "snapshot",
                    "revision": store.get_stream_revision(),
                    "state": state.as_dict(),
                }
            )
            async with create_task_group() as tasks:
                tasks.start_soon(send_events, tasks.cancel_scope)
                while (await websocket.receive())["type"] != "websocket.disconnect":
                    pass
                tasks.cancel_scope.cancel()
        except WebSocketDisconnect:
            pass
        finally:
            with CancelScope(shield=True):
                await events.unsubscribe(queue)

    return application


app = create_app()
