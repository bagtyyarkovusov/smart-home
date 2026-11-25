# Smart Home

A software-engineering course project for one household. Residents can lay out rooms and furniture, control devices from the floor plan, see confirmed state, and run Home, Away, and Sleep scenes.

## Start here

- [Week 13 demo spec](https://github.com/bagtyyarkovusov/smart-home/issues/2) and [first editor ticket](https://github.com/bagtyyarkovusov/smart-home/issues/3).
- [Team delivery workflow](docs/agents/coding-workflow.md) and [issue tracker](docs/agents/issue-tracker.md).

- [Team execution plan (中文)](docs/project-plan-zh.md) covers the four roles, GitHub workflow, and weekly deliverables.
- [Week 10 architecture](docs/architecture.md) covers the five layers, interfaces, and first end-to-end feature.
- [Course checklist](docs/checkpoint-checklist-en.md) covers the review, mandatory features, later demonstration, and final delivery.

For the Week 10 checkpoint, explain the household problem, show the five layers and walk through one lamp command and its result. The code dependency direction is **Presentation → Strategy → Control → Device**. Data is available through interfaces. Present the four team roles and the Week 13 demo goal.

## Run the Week 13 demo

Use the [Pascal workspace and FastAPI startup guide](frontend/pascal/README.md)
for the supported one-room demo.

## Run the Home3D fallback

Use Node.js 22.12+, npm and Git. From the repository root:

```sh
./frontend/setup-home3d.sh
cd frontend/.home3d
npm ci
npm run dev -- --host 127.0.0.1
```

Open [the editor](http://127.0.0.1:5173). Use **Wall** to pick two endpoints,
then open **Furniture** and drag **Sample Floor Lamp** onto the plan. Drag it again
to move it, adjust **Rotation** in the properties panel, then use **Save layout**.
Reload the page and switch between **2D Plan** and **3D View**.

The editor saves and reloads through `PUT` and `GET /api/layouts/week-13`. An
empty mock returns HTTP 404 and opens a blank plan. Saving writes
`frontend/.home3d/.mock/layout.json`. The [Week 13 layout contract](docs/contracts/week-13/README.md)
stores one wall and one sample floor lamp. Plan coordinates are in centimetres,
with x/y mapped to 3D X/Z in metres. Rotation is stored in degrees. The placed
lamp keeps its object ID and separate `deviceId: "lamp-7"` link.

To reproduce a save error, open [the failure demo](http://127.0.0.1:5173/?failSave=1),
make a layout edit and select **Save layout**. The first valid save in that page
session returns HTTP 500 with `layout_save_failed`. The draft stays visible.
Select **Retry save**, then reload to verify the edit was saved.

### Verify

From the repository root:

```sh
node --test frontend/tests/layout-http.test.mjs
cd frontend/.home3d
npm run build
SMART_HOME_BROWSER_CHANNEL=chrome npm run test:e2e -- --config tests/playwright.config.ts
```

The Playwright test starts with isolated storage, loads the committed fixture,
and checks the reopened Three.js wall and lamp transforms. It prints the HTTP statuses. Set `SMART_HOME_EVIDENCE_DIR` to an absolute output directory to
capture the failed save, the saved plan and both reopened views. Omit
`SMART_HOME_BROWSER_CHANNEL` if Playwright Chromium is already installed.

### Home3D attribution

Smart Home adapts [Home3D by lohith9](https://github.com/lohith9/Home_View) using
Route B at revision [`392bb92cbb5cf13a673795193aadb5e9c62b5bfe`](https://github.com/lohith9/Home_View/commit/392bb92cbb5cf13a673795193aadb5e9c62b5bfe).
Setup fetches that revision and applies the local integration patch in an ignored
directory. To assemble from a previously downloaded GitHub archive of the same
revision, pass its absolute ZIP path to `./frontend/setup-home3d.sh`.
