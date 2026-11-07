# SkyRealm Game 0.20.50.70 — Stone Quarry & World Expansion

## New outdoor stone economy
- Added a stone quarry outpost and the stonemason Bran to the ordinary world.
- Existing outdoor boulders now contain deterministic stone, coal, iron, copper or rare crystal veins with quality tiers and visible mineral markings.
- Mine veins with a selected pickaxe using E. Hits show cracks, impact shake, dust/spark effects and ore-specific sounds; depleted veins leave rubble and regrow after in-game time passes.
- Mining awards stone, bonus ore, player XP and miner-profession progress. Quarry progress, vein depletion and regrowth are stored in each world's existing save.
- Bran buys stone and ores at quarry rates, sells upgraded pickaxes, and offers a paid delivery contract for 25 stone.

## Accumulated unpublished systems included in this release
- Added two persistent professions: Lumberjack and Miner, with contracts, XP, levels, bonuses, rewards and progress.
- Updated Boss World arena routing: four themed arena sites, major bosses assigned to their corresponding arenas, old saved bosses migrated, arena state persisted, and only one major boss active at a time.
- Added Russian/English game language selection and translations for menus, professions and arena messages.
- Includes the current installed world, sea, challenge, expansion, multiplayer, cosmetic/mod runtime and interface assets referenced by index.html.

## Performance and compatibility
- The quarry update runs on a throttled interval and skips pause, menu and other-world states; its outpost is viewport-culled.
- Existing world save keys and player settings are retained. Quarry fields are optional and older saves initialize them automatically.
- Player movement code was not modified. The existing adaptive frame-rate behaviour was retained.

## Validation status
- All 13 JavaScript runtime files passed node --check on the installed build.
- The game runner launched and the intro/main menu rendered; menu controls were present.
- Static checks confirmed stone generation, mining, regrowth, persistence and quarry UI hooks.
- Full in-world quarry harvesting and boss-combat playtesting has not been completed; the GitHub release workflow provides an additional automated regression/build gate.
