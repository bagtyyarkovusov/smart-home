# Smart Home workspace

The floor plan is the primary surface. Use the header for view and save actions, the left panel for layout tools, and the right panel for the selected object's properties. Give new editor features a visible control once their results can be saved and reopened.

| Role | Color |
| --- | --- |
| Panels | `#FFFFFF` |
| 2D canvas | `#EEF2F5` |
| Canvas grid and dividers | `#D7E0E8` |
| Text and unselected walls | `#172A3A` |
| Selection, focus and primary actions | `#2457B8` |
| 3D ground | `#E8DBCA` |

Use Instrument Sans for labels, controls, and dimensions. Use thin dividers between panels, compact labeled controls, and a visible keyboard focus ring. Use drawing blue to mark a selection in either view. Show geometry in centimeters and give each editable value a label.

On a blank plan, offer **Draw wall** at the point of use. Keep **Add floor lamp** available from the tools panel and support both keyboard placement and drag-and-drop. Keep the save status above the canvas so changes in feedback never move the plan during an edit. On save failure, explain that the draft is still present and show **Retry save** in the same row.

Use the same desktop viewport for before and after review evidence. At 1366×768, verify that a new user can start a wall, place the lamp, edit its position and rotation, save, and reopen the 2D and 3D views. The live integration adds confirmed device status and command feedback to the same workspace.
