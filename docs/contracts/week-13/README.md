# Week 13 layout and lamp contract

This contract serves the [Week 13 demo](https://github.com/bagtyyarkovusov/smart-home/issues/2). Use the same [layout fixture](layout.v1.json) as a PUT body and as the saved layout in the [Home3D mock adapter](https://github.com/bagtyyarkovusov/smart-home/issues/3) and the FastAPI backend. The editor adapter maps the wire document to Home3D objects. The backend owns the last saved layout.

## Layout v1

The document has integer `version: 1`, layout `id: "week-13"`, and a `rooms` array with one room. The room has an `id`, one entry in `walls`, and one entry in `items`. Each wall has an `id` and ordered `start` and `end` points. Each placed item has an `id`, `templateId: "floor-lamp"`, `deviceId: "lamp-7"`, a center `position`, and `rotationDeg`.

Keep room, wall, and placed item IDs stable through edits, saves, and reloads. IDs are nonempty strings. Room IDs are unique in the layout. Wall and placed item IDs share one namespace within the layout because Home3D imports them into one object list. Retain the supplied wall and placed item IDs as Home3D object IDs on load. The placed item ID identifies the editor object. Use `deviceId` to address the lamp and read its confirmed power.

- Points are `[x, y]` pairs in centimeters in the unpanned, unzoomed editor coordinate space. `+x` goes right and `+y` goes down in plan view. Coordinates accept finite signed numbers. Wall endpoints must differ.
- `rotationDeg` is a finite angle in degrees about the item center. Zero leaves the item's local `+x` axis aligned with plan `+x`. Positive angles turn clockwise in plan view. Preserve the stored angle through save and load, including negative angles and angles beyond a full turn.
- For 3D, the renderer maps a floor point to `(x/100, 0, y/100)` in meters, with `+Y` up. It sets Three.js Y-axis rotation in radians to `-rotationDeg * π / 180`. Map the wall's points directly to Home3D's `start` and `end`. Map the lamp center and angle directly to the store's `x`, `y`, and `rotation`.
- Restore the demo lamp as a Home3D `furniture` object with `subType: "lamp"`. The fixed `floor-lamp` template supplies a 40 cm local X span, 20 cm local plan-Y span, and 120 cm vertical height. Home3D calls those fields `width`, `height`, and `depth`, respectively. Home3D supplies wall thickness and height for each view. The wire document persists the wall centerline and lamp transform. Room membership groups those objects and a single wall is sufficient for the demo.

### Pinned Home3D mapping

The project references Home3D at `392bb92cbb5cf13a673795193aadb5e9c62b5bfe`. Its 2D canvas undoes pan and zoom before editing, draws walls from their endpoints, and applies CSS rotation to an item centered on its stored coordinates. Its 3D canvas uses `SCALE = 100`, computes the wall midpoint and yaw from its endpoints, and negates the placed item angle for the floor plane. Importing the object list preserves its object fields and IDs. [2D coordinates](https://github.com/lohith9/Home_View/blob/392bb92cbb5cf13a673795193aadb5e9c62b5bfe/frontend/src/components/canvas/Canvas2D.jsx#L115-L124) · [2D wall and item](https://github.com/lohith9/Home_View/blob/392bb92cbb5cf13a673795193aadb5e9c62b5bfe/frontend/src/components/canvas/Canvas2D.jsx#L1078-L1160) · [3D scale](https://github.com/lohith9/Home_View/blob/392bb92cbb5cf13a673795193aadb5e9c62b5bfe/frontend/src/components/canvas/Canvas3D.jsx#L1-L8) · [3D wall and model dimensions](https://github.com/lohith9/Home_View/blob/392bb92cbb5cf13a673795193aadb5e9c62b5bfe/frontend/src/components/canvas/Canvas3D.jsx#L136-L178) · [3D item transform](https://github.com/lohith9/Home_View/blob/392bb92cbb5cf13a673795193aadb5e9c62b5bfe/frontend/src/components/canvas/Canvas3D.jsx#L232-L235) · [Store import](https://github.com/lohith9/Home_View/blob/392bb92cbb5cf13a673795193aadb5e9c62b5bfe/frontend/src/store/useDesignStore.js#L250-L256)

The fixture's wall runs from `(20, 40)` to `(320, 440)` in plan centimeters. In 3D its floor endpoints are `(0.2, 0, 0.4)` and `(3.2, 0, 4.4)`. Its mesh center is `(1.7, 1.5, 2.4)`, its length is 5 m, and its yaw is approximately `-0.927295` rad. The lamp at `(120, 80)` and `30°` renders at `(1.2, 0, 0.8)` with yaw `-π/6`. Taking `x = 100X`, `y = 100Z` and `rotationDeg = -yaw × 180/π` recovers the fixture coordinates and angle before rounding.

## Layout HTTP

Use JSON bodies and `Content-Type: application/json`. The example files contain wire bodies. For errors, handle the HTTP status and `error.code`. The server may vary the human-readable `error.message`.

| Request | Response | Example body |
| --- | --- | --- |
| `GET /api/layouts/week-13` | `200 OK` with the saved document | [layout.v1.json](layout.v1.json) |
| `GET /api/layouts/week-13` before any save | `404 Not Found`. Open a blank editor. | [`layoutNotFound`](layout-errors.json) |
| `PUT /api/layouts/week-13` with [layout.v1.json](layout.v1.json) | `200 OK` with the committed document. Creates or replaces the whole layout. | [layout.v1.json](layout.v1.json) |
| `PUT /api/layouts/week-13` with invalid v1 data | `422 Unprocessable Content` | [`invalidLayout`](layout-errors.json) |
| `PUT /api/layouts/week-13` when storage fails | `500 Internal Server Error` | [`layoutSaveFailed`](layout-errors.json) |

A PUT that returns `422` or `500` leaves the previous saved document available. Keep the unsaved edits visible and offer retry. To exercise this in the mock, inject a storage failure for one PUT, then retry the same document. A later GET returns the last successful PUT.

## Lamp HTTP

The [lamp examples](lamp-scenarios.json) contain independent success and timeout runs from `initialState`. Each example names the exact request or response body.

| Request | Response | Example JSON member |
| --- | --- | --- |
| `GET /api/devices/lamp-7/state` | `200 OK` with confirmed state | `initialState` or `success.event.state` |
| `POST /api/devices/lamp-7/commands` with `success.request` or `timeout.request` | `202 Accepted` with the new command in `pending` status | `success.accepted`, `timeout.accepted` |
| `GET /api/devices/lamp-7/commands/{requestId}` | `200 OK` with the current command record | Pending uses `success.accepted`. Terminal uses `success.event.command` or `timeout.event.command`. |

The POST body contains a client-generated, nonempty `requestId`, `capability: "power"`, and a Boolean `value`. `true` requests On and `false` requests Off. Persist acceptance before replying. The command record's `value` is the requested value in every status. The map, list, and control panel all display the same confirmed value and its server-provided UTC timestamp. They can display command progress alongside it.

Use a fresh ID per new intent. Repeating the same ID, target, capability, and value returns the current command record with `200 OK` and dispatches the command only once. Reusing an ID with different command fields returns `409` with `error.code: "request_id_conflict"`. Invalid command input returns `422` with `error.code: "invalid_command"`. An unknown device or command lookup returns `404` with `error.code: "device_not_found"` or `"command_not_found"`, respectively. The error body has the same `{error: {code, message}}` shape as the layout errors.

## Lamp WebSocket

Connect to `/api/ws`. The server sends one JSON object per text frame. A `snapshot` is always the first frame and contains the current confirmed `state` and the stream's current `revision`. On the success path, Control commits confirmed state and the command outcome together, then publishes them in one frame.

| Frame `type` | Body in addition to `type` and stream `revision` |
| --- | --- |
| `snapshot` | `state` as returned by the state GET. See `timeout.reconnect`. |
| `command.succeeded` | Terminal `command` with `status: "succeeded"` and confirmed `state`. See `success.event`. |
| `command.timed_out` | Terminal `command` with `status: "timed_out"`. See `timeout.event`. |
| `command.rejected` | Terminal `command` with `status: "rejected"` after a device rejection. |
| `state.changed` | Confirmed `state` from a fresh device report independent of a command outcome. |

Control sets a deadline for confirmation. If it expires first, record `timed_out` and continue displaying the last confirmed value. A timeout leaves the device outcome uncertain. A newer, trustworthy report can update confirmed state through `state.changed` while the command stays terminal. Exercise timeout by configuring the simulator to withhold confirmation beyond the deadline while sending the normal POST body.

### Ordering and reconnect

1. The persisted stream revision starts at 0 and increases for each published command outcome or independent state change. A confirmed state's own `revision` is the revision of its last confirmed update. The snapshot's stream revision may be higher than the state revision after a timeout or rejection.
2. The server sends the snapshot and subsequent events in revision order, including any publications that occur while the snapshot is being sent. Within that connection, discard events at or below the last applied stream revision. Apply confirmed state only when initializing the projection or when its state revision is newer. A stale HTTP state response cannot overwrite a newer WebSocket value.
3. On reconnect, use the first frame as a fresh snapshot and stream baseline. For each unresolved local `requestId`, look up the command record by HTTP after receiving the snapshot. If the POST response was lost, retry the same POST with the same ID and body. A terminal outcome wins over late pending responses for the same ID. Use the stream for future events.
4. Persist request IDs, state, and revision across backend restarts. Recover a pending command against its original deadline. If no confirmation arrives by then, record it as timed out. Recovery uses command lookup and fresh state. It sends no automatic repeat to the simulator.

## Integration walkthrough

| Check | What to send and what to expect |
| --- | --- |
| Layout reload | PUT `layout.v1.json` and expect `200`. Fetch again with GET and expect the same document, IDs, endpoints, center, and angle. Check the plan and 3D positions above. Try a failing PUT and confirm the stored layout and unsaved edits are both recoverable. |
| Confirmed power On | Start at `initialState` and connect to the WebSocket. POST `success.request`, expect `202` with `success.accepted`, then receive `success.event`. Check that the map, list, and controls all show On and that the state GET agrees. A fast success event may arrive before the HTTP response. |
| Timeout and reconnect | Start again at `initialState` and force timeout. POST `timeout.request`, expect `202` with `timeout.accepted`, then receive `timeout.event`. The command shows timeout and all three views still show Off. To simulate a missed event, reconnect after timeout, expect `timeout.reconnect`, and look up the request ID to recover its terminal outcome. |

From the repository root, validate the three JSON examples with `jq -e -s 'length == 3' docs/contracts/week-13/*.json`.
