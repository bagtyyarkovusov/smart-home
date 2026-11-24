# Smart Home

A software-engineering course project for one household. Residents can lay out rooms and furniture, control devices from the floor plan, see confirmed state, and run Home, Away, and Sleep scenes.

## Start here

- [Week 13 demo spec](https://github.com/bagtyyarkovusov/smart-home/issues/2) and [first editor ticket](https://github.com/bagtyyarkovusov/smart-home/issues/3).
- [Team delivery workflow](docs/agents/coding-workflow.md) and [issue tracker](docs/agents/issue-tracker.md).

- [Team execution plan (中文)](docs/project-plan-zh.md) covers the four roles, GitHub workflow, and weekly deliverables.
- [Week 10 architecture](docs/architecture.md) covers the five layers, interfaces, and first end-to-end feature.
- [Course checklist](docs/checkpoint-checklist-en.md) covers the review, mandatory features, later demonstration, and final delivery.

For the Week 10 checkpoint, explain the household problem, show the five layers and walk through one lamp command and its result. The code dependency direction is **Presentation → Strategy → Control → Device**. Data is available through interfaces. Present the four team roles and the Week 13 demo goal.

The project is at the architecture review stage. The first implementation will connect a Home3D layout to server persistence and let a resident control one simulated lamp.

Home3D is the planned floor-plan editor. [Upstream Home3D project](https://github.com/lohith9/Home_View)
