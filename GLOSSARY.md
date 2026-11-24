# Smart Home glossary

| Term | Meaning |
| --- | --- |
| Layout | Saved floor-plan geometry, including rooms, walls, and placed items. |
| Furniture template | Reusable configuration for a furniture or device type, including dimensions and an illustration. |
| Placed item | An item on the floor plan with its own identity and transform. A controllable item links to a device instance. |
| Device instance | A device with a stable identifier, declared capabilities, and reported state. |
| Capability | A typed operation or state property such as writable lamp power. |
| Command | A request to change a capability on a device, tracked by request ID. |
| Confirmed state | The latest state reported by the device and committed by the server. Pending command outcomes are tracked separately. |
| Scene | Named configuration of conditions, actions, and optional delays. |
