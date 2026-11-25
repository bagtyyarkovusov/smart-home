# Use Pascal Editor for the Week 13 demo

Bagtyyar chose Pascal Editor in its supported Next.js setup for [the room-and-lamp demo](https://github.com/bagtyyarkovusov/smart-home/issues/11). The [evaluation](https://github.com/bagtyyarkovusov/smart-home/pull/17) demonstrated shared walls, linked 2D and 3D editing, and Smart Home controls in the inspector. These capabilities give the team a path from the first lamp demo to a furnished house. The team still needs to confirm the editor change with the instructor before presenting it.

FastAPI and SQLite remain responsible for saved layouts and confirmed device state. The Pascal host uses a versioned scene document and a separate device binding. Import the existing Week 13 fixture with its geometry and identities preserved. Keep the command and state contract, with the plan, 3D view, device list, and inspector reading one confirmed-state projection.

Use the 3D status badge for lamp selection during the demo. The evaluation found unreliable direct mesh picking and a package configuration workaround. Keep the Home3D workspace available as the course fallback while the Pascal delivery is verified.
