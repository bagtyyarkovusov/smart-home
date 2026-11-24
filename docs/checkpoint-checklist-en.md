# Smart Home System course-design checklist

Source: *Smart Home System Design and Implementation*, student guide, November 2026. Section numbers below refer to that guide. The instructor's screenshot confirms the Week 10 architecture review criteria in §5.2.

## Week 10 architecture review (§1.3, §3, §5.2)

- [ ] Describe a concrete household, its problems, the project goals, and the proposed scope. Label assumptions about the household.
- [ ] Present the feasibility analysis, requirements specification v1.0, and architecture diagram called out in the schedule. Explain the approach and who owns which work.
- [ ] Explain all five layers and identify where a user request becomes a command, where commands are validated and dispatched, and where device reports become recorded state.
- [ ] Draw code dependency arrows from Presentation → Strategy → Control → Device. Show Data through interfaces and distinguish the runtime flow of results and state from code dependencies.
- [ ] Walk through key interfaces using one manual command and one scene. State what happens when a command succeeds, fails, or times out. Explain which component publishes the state displayed in the map, list, and control panel.
- [ ] Show the type, capability, and device-instance model. Explain how a new supported type can be introduced through configuration.
- [ ] Explain the rationale for the proposed technology and simulator or hardware choices. Keep choices pending until the team agrees.

| Layer | Responsibility |
| --- | --- |
| Presentation | Render the map and device status, collect input, and report progress and outcomes. Keep SQL and business rules out of this layer. |
| Strategy | Translate intent into device commands, evaluate rules, and calculate environmental adaptations. Obtain data through interfaces and leave device protocols and database operations to their owners. |
| Control | Validate, orchestrate, dispatch, retry, write confirmed state, and broadcast updates. Temperature and scene policy belong in Strategy. |
| Device | Describe capabilities, execute commands, and report state. Rooms and users belong to the application domain. |
| Data | Persist and query records, manage transactions and caching, and expose data through interfaces. Business decisions belong in the application layers. |

## How to read the guide

- **Five layers.** §3.1 makes layering mandatory and describes five layers as the recommended structure. §5.2 explicitly tests all five responsibilities, so prepare the five-layer architecture for the review.
- **Device API paths.** Appendix A marks its endpoints as examples. A route such as `POST /api/devices/{id}/commands` names a resource. Its handler can call Strategy, which can convert a manual intent into a one-command plan and invoke Control. This is a proposed way to satisfy §3.1's no-skip chain.
- **Shared Data interfaces.** §3.1 permits Data to be used through interfaces. Strategy can read the environmental snapshot and rule configuration through an interface while Data owns SQL, database sessions, and persistence.
- **Timing.** §1.3 gives a general end-of-project-week-three architecture gate and assigns the first review and architecture diagram to teaching Week 10. The sample plan places detailed architectural design in Week 11. §5.2 and the instructor screenshot explicitly identify Week 10 as the architecture review. The teaching calendar governs actual dates.
- **Milestone count.** §5.2's heading says three checkpoints and lists four entries. The Week 15 schedule calls for pre-acceptance and §5.2 calls for code freeze. Prepare for both at that milestone.
- **Scope of explanations.** The suggested architecture choices and interface examples should be labeled proposals until agreed. Performance and completion claims require runtime evidence.

## Mandatory functionality for the course project (§1.2, §2.1)

A runnable browser-based frontend, backend, and persistent data store are required. The project serves a single household. Simulated devices are allowed. Native apps, physical hardware, multi-tenancy, and commercialization are optional. 3D and multiple users with permissions are encouraged. Teams own core business logic and may reuse suitable open-source components under their license.

| ID | Acceptance checklist |
| --- | --- |
| F1 · Household management | CRUD items and devices with name, category, room, coordinates, and state. Filter by room/category and search by keyword. Bulk import and export in JSON or CSV. Persist coordinate edits. |
| F2 · Furniture and device catalog | Define templates with name, default dimensions, icon, configurable attributes, and at least one illustration per type. Use metadata for type-specific properties such as AC mode and target temperature, lamp brightness and color temperature, and curtain opening. Add a type without changing frontend code. |
| F3 · Floor plan and placement | Draw walls, drag furniture from the catalog, move/rotate/delete items, and select items to edit properties. Save the floor plan and restore it on refresh. Grid and endpoint snapping are suggested. |
| F4 · Control and state | Issue capability commands such as power, brightness, temperature, and mode. Show the same confirmed state in the map, device list, and control panel, plus last update time and a history chart. Report success, failure, and timeout. |
| F5 · Scenes and adaptive temperature | Implement Home, Away, and Sleep with conditions and action sets, including parameterized and delayed actions. Report scene progress. Use season and indoor/outdoor temperature to adapt the target. The guide's comfort design also uses humidity, recommends 24–28 °C in summer, 18–22 °C in winter and natural ventilation in spring/autumn, specifies a 1 °C hysteresis gap between switching thresholds, and calls for an explanation of each automatic adjustment. |

For F5, be ready to explain how policy handles missing or stale sensor data and how hysteresis depends on the current on/off state. The guide gives comfort bands and a switching gap. The team still needs to agree on the formula, thresholds, and fallback.

## Optional depth (§2.2, §6.2, §7.2)

| ID | What a substantive implementation demonstrates |
| --- | --- |
| E1 | Temperature, humidity, light, and presence sensing or simulation. Automatic actions, conflict resolution with explanations, and temporary manual override. |
| E2 | A robot with position, heading, battery, status, and a live map trail. Grid coverage planning is suggested. |
| E3 | Natural-language commands parsed to room/device/action/parameters, with keyword fallback, whitelist validation, and confirmation of dangerous operations. |
| E4 | Multi-turn assistance, remembered preferences, reference resolution, habit-based suggestions, and explanations. |

The guide prioritizes depth over breadth. Its final video checklist includes at least one optional feature, and its top scoring band calls for at least two with substantive depth.

## Requirements, verification, and delivery (§1.4, §2.3–2.4, §5–7)

- [ ] Requirements specification includes a use-case diagram with mandatory/optional scope, a main use case for each F1–F5 with preconditions, normal and exception flows and postconditions, a domain class diagram, one complete AC or light state machine, a justified MoSCoW priority table, and measurable nonfunctional requirements.
- [ ] Feasibility addresses cost, schedule, risks, alternatives, and social, health, safety, legal, and cultural impacts.
- [ ] Verify at least 30 FPS with up to 50 furniture items, at most 1 s end-to-end command latency on a LAN, and a first screen within 3 s. Record hardware, workloads, and measurement methods with results.
- [ ] Test recovery and persistence through service interruption, retry, and key-operation logging. Verify comprehensible errors, primary functions within three clicks, current Chrome and Edge, and desktop display at 1366×768 or larger.
- [ ] Provide login, API input validation, secret-free storage and repository, configuration-driven type extension, README, and one-command local startup. Mobile layout is outside the minimum.
- [ ] Organize three to four students with one lead over roughly eight weeks. Everyone codes. Keep weekly peer-review records and integrate at least once a week. Keep main runnable, use feature branches, review before merging, and use the guide's commit prefixes.
- [ ] Week 13 running version demonstrates map creation → furniture placement → device control → state view. Prepare the runnable version and its test report.
- [ ] Week 15 pre-acceptance and code freeze. After freeze, fix defects.
- [ ] Week 16 final package includes feasibility, requirements, high-level design, detailed design, source, test report, user manual, a narrated or subtitled 3–5 minute video, and defense slides.
- [ ] Final video covers map creation, furniture placement, single-device control, state, scenes, and at least one optional feature. Prepare populated and blank live-demo data and an on-the-spot configuration edit. Defense runs 10 minutes plus 5 minutes of questions.
- [ ] If reusing Home3D, check the upstream license and attribution, coordinate units, catalog limitations, and how its browser store connects to server persistence. §4 lists iframe embedding, fork adaptation, and engine-only reuse. §3.3 treats the technology stack as a recommendation and asks for a rationale for choices.

The guide weights topic justification 10%, design report 40%, defense 20%, and implementation 30%.
