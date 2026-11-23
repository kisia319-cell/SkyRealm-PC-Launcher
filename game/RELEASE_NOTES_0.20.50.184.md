# SkyRealm 0.20.50.184 — Apocalypse save coverage

- Added laboratory progress to the main Apocalypse world snapshot, including opened containers, cleared infected, released quarantine subjects, generator/terminal/reactor flags and final vault completion.
- Laboratory progress is now isolated by world ID. A one-time migration preserves the previous shared laboratory progress for the first world opened.
- Switching Apocalypse worlds reloads that world's laboratory state instead of leaking progress between saves.
- Cloud backup and restore now accept Apocalypse world lists, world snapshots, laboratory progress, living-world state and world-event state. Apocalypse worlds are merged independently from normal worlds.
- Existing player/world save fields remain in place. Movement, joystick and input code were not changed.
