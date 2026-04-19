# @mujoco-viewer/viewer-ui

Reusable MuJoCo viewer UI — the scene canvas, the inspector/edit panels, keyboard shortcuts, and the XML edit session.

Consumers mount `<ViewerApp adapter={...}>` and hand in a `HostAdapter` from `@mujoco-viewer/protocol`. The adapter owns all file I/O: where the root XML comes from, how includes resolve, and where Save writes. The UI itself has no notion of VSCode, disk, or network.

Internal workspace package; not published.
