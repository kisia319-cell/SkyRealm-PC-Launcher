# SkyRealm 0.20.50.86 — Boss Realm structure and collision rebuild

- Boss Realm movement no longer checks collision against legacy valley terrain, water, trees, cabin and placed structures that are not rendered in that dimension. Only map boundaries remain blocking there.
- Rebuilt the four Boss Realm dungeon-site surroundings with visible themed ancient platforms, six pillars per site, glowing runes and animated arcane cores.
- These decorative ruins intentionally do not block player movement, so visible geometry and collision stay consistent.
- Player walking and movement calculations were not changed.
- Automated gameplay tests and full visual playtesting are required before treating the build as fully verified.
