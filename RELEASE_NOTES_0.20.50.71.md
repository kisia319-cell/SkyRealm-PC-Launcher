# SkyRealm Game 0.20.50.71 — Quarry dialog polish and regression coverage

## Fix
- Corrected Bran's quest-dialog location subtitle: the stonemason is now identified as part of the quarry in the ordinary world, not the Trade World.
- Existing Trade World NPCs keep their original location label.

## Regression coverage
- Added a dedicated quarry system test covering pickaxe damage tiers, inventory rewards, XP and miner progress, depleted-vein protection, in-game regrowth and save persistence.
- Covers quarry stone selling, upgraded-pickaxe purchase, Bran's 25-stone delivery contract and its payout.
- Verifies the E-key interaction path and the correct quarry location label.

## Compatibility
- No player movement code changed.
- No world saves, settings or player inventory were reset.
- The quarry test is part of both the co-op regression workflow and Windows release pre-build checks.
